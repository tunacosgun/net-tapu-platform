import { Injectable, Logger, Inject, Optional, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  PaymentLedger,
  LedgerEvent,
  PaymentStatus,
  IPosGateway,
  POS_GATEWAY,
  Deposit,
} from '@nettapu/shared';
import { Payment } from '../entities/payment.entity';
import { PosTransaction } from '../entities/pos-transaction.entity';
import { MetricsService } from '../../../metrics/metrics.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PosCallbackService {
  private readonly logger = new Logger(PosCallbackService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @Inject(POS_GATEWAY)
    private readonly posGateway: IPosGateway,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  /**
   * Process a POS provider callback.
   *
   * Steps:
   *   1. Verify callback signature
   *   2. Extract payment ID from callback payload
   *   3. Pessimistic lock on Payment
   *   4. Check status is awaiting_3ds (idempotency guard)
   *   5. Verify provider matches, token matches, amount matches
   *   6. Call completeProvision() to get final result
   *   7. Record PosTransaction + update status + write ledger
   */
  async processCallback(
    provider: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
    callerIp: string,
  ): Promise<void> {
    // 1. Verify signature
    const valid = this.posGateway.verifyCallback(headers, body);
    if (!valid) {
      this.logger.warn(
        JSON.stringify({
          event: 'callback_signature_invalid',
          provider,
          caller_ip: callerIp,
        }),
      );
      this.metrics?.callbackRejectedTotal.inc({ provider, reason: 'invalid_signature' });
      throw new BadRequestException('Invalid callback signature');
    }

    // 2. Extract payment ID (provider-specific field)
    const paymentId = this.extractPaymentId(provider, body);
    if (!paymentId) {
      this.logger.warn(
        JSON.stringify({
          event: 'callback_missing_payment_id',
          provider,
          body: JSON.stringify(body),
        }),
      );
      this.metrics?.callbackRejectedTotal.inc({ provider, reason: 'missing_payment_id' });
      throw new BadRequestException('Missing payment identifier in callback');
    }

    this.metrics?.callbackReceivedTotal.inc({ provider });

    this.logger.log(
      JSON.stringify({
        event: 'callback_received',
        provider,
        payment_id: paymentId,
        caller_ip: callerIp,
      }),
    );

    // 3-7. Process under pessimistic lock
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const locked = await qr.manager
        .createQueryBuilder(Payment, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: paymentId })
        .getOne();

      if (!locked) {
        this.logger.warn(
          JSON.stringify({
            event: 'callback_payment_not_found',
            provider,
            payment_id: paymentId,
          }),
        );
        this.metrics?.callbackRejectedTotal.inc({ provider, reason: 'payment_not_found' });
        await qr.rollbackTransaction();
        return;
      }

      // Idempotency: only process if awaiting_3ds
      if (locked.status !== PaymentStatus.AWAITING_3DS) {
        this.logger.log(
          JSON.stringify({
            event: 'callback_already_processed',
            provider,
            payment_id: paymentId,
            current_status: locked.status,
          }),
        );
        await qr.rollbackTransaction();
        return;
      }

      // 5a. Token verification: callback token must match stored posTransactionToken
      if (locked.posTransactionToken) {
        const callbackToken =
          provider === 'iyzico'
            ? (body.token as string | undefined)
            : (body.pos_transaction_token as string | undefined) ??
              (body.token as string | undefined);

        if (!callbackToken || callbackToken !== locked.posTransactionToken) {
          this.logger.warn(
            JSON.stringify({
              event: 'callback_token_mismatch',
              provider,
              payment_id: paymentId,
              caller_ip: callerIp,
              expected_token_present: !!locked.posTransactionToken,
              received_token_present: !!callbackToken,
            }),
          );
          this.metrics?.callbackRejectedTotal.inc({ provider, reason: 'token_mismatch' });
          await qr.rollbackTransaction();
          throw new BadRequestException('Callback token does not match payment');
        }
      }

      // 5b. Amount cross-check: verify callback amount matches DB payment amount
      const amountMismatch = this.checkAmountMismatch(provider, body, locked);
      if (amountMismatch) {
        this.logger.warn(
          JSON.stringify({
            event: 'callback_amount_mismatch',
            provider,
            payment_id: paymentId,
            caller_ip: callerIp,
            ...amountMismatch,
          }),
        );
        this.metrics?.callbackRejectedTotal.inc({ provider, reason: 'amount_mismatch' });
        await qr.rollbackTransaction();
        throw new BadRequestException('Callback amount does not match payment');
      }

      // Record callback receipt timestamp
      locked.callbackReceivedAt = new Date();

      // Call completeProvision to get final result
      const posStart = Date.now();
      const provisionResult = await this.posGateway.completeProvision({
        paymentId,
        posTransactionToken: locked.posTransactionToken || '',
        callbackPayload: body,
        idempotencyKey: `3ds_complete:${paymentId}`,
      });
      this.metrics?.posCallDurationMs.observe({ provider, method: 'completeProvision' }, Date.now() - posStart);
      this.metrics?.posCallTotal.inc({ provider, method: 'completeProvision', status: provisionResult.success ? 'success' : 'error' });

      // Record POS transaction
      await qr.manager.save(
        PosTransaction,
        qr.manager.create(PosTransaction, {
          paymentId,
          provider,
          externalId: provisionResult.posReference,
          amount: locked.amount,
          currency: locked.currency,
          status: provisionResult.success ? 'provisioned' : 'failed',
          callbackPayload: body,
          callbackReceivedAt: locked.callbackReceivedAt,
          callbackIp: callerIp,
          responsePayload: provisionResult as unknown as Record<string, unknown>,
        }),
      );

      // 3DS completion duration: time from initiation to callback
      if (locked.threeDsInitiatedAt) {
        const durationMs = Date.now() - locked.threeDsInitiatedAt.getTime();
        this.metrics?.threeDsCompletionDurationMs.observe({ provider }, durationMs);
      }

      if (provisionResult.success) {
        locked.status = PaymentStatus.PROVISIONED;
        await qr.manager.save(Payment, locked);

        // Callback received ledger entry
        await qr.manager.save(
          PaymentLedger,
          qr.manager.create(PaymentLedger, {
            paymentId,
            event: LedgerEvent.THREE_DS_COMPLETED,
            amount: locked.amount,
            currency: locked.currency,
            metadata: {
              posReference: provisionResult.posReference,
              callerIp,
            },
          }),
        );

        await qr.manager.save(
          PaymentLedger,
          qr.manager.create(PaymentLedger, {
            paymentId,
            event: LedgerEvent.PAYMENT_PROVISIONED,
            amount: locked.amount,
            currency: locked.currency,
            metadata: { posReference: provisionResult.posReference },
          }),
        );

        // Create Deposit + AuctionParticipant for auction payments
        if (locked.auctionId) {
          await this.createDepositAndParticipant(qr.manager, locked);
        }
      } else {
        locked.status = PaymentStatus.FAILED;
        await qr.manager.save(Payment, locked);

        await qr.manager.save(
          PaymentLedger,
          qr.manager.create(PaymentLedger, {
            paymentId,
            event: LedgerEvent.THREE_DS_FAILED,
            amount: locked.amount,
            currency: locked.currency,
            metadata: {
              reason: provisionResult.message,
              callerIp,
            },
          }),
        );
      }

      await qr.commitTransaction();

      this.metrics?.threeDsCompletedTotal.inc({
        provider,
        outcome: provisionResult.success ? 'success' : 'failed',
      });

      this.logger.log(
        JSON.stringify({
          event: 'callback_processed',
          provider,
          payment_id: paymentId,
          success: provisionResult.success,
          new_status: provisionResult.success ? 'provisioned' : 'failed',
        }),
      );
    } catch (err) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      this.logger.error(
        JSON.stringify({
          event: 'callback_processing_error',
          provider,
          payment_id: paymentId,
          error: (err as Error).message,
        }),
      );
      throw err;
    } finally {
      await qr.release();
    }
  }

  /** Create Deposit + AuctionParticipant when auction payment is provisioned */
  private async createDepositAndParticipant(
    manager: import('typeorm').EntityManager,
    payment: Payment,
  ): Promise<void> {
    try {
      const provider = this.config.get<string>('POS_PROVIDER', 'mock');
      const deposit = manager.create(Deposit, {
        userId: payment.userId,
        auctionId: payment.auctionId!,
        amount: payment.amount,
        currency: payment.currency,
        status: 'collected',
        paymentMethod: payment.paymentMethod ?? 'credit_card',
        posProvider: provider !== 'mock' ? provider : null,
        posTransactionId: null,
        idempotencyKey: payment.idempotencyKey,
      });
      const savedDeposit = await manager.save(Deposit, deposit);

      await manager.query(
        `INSERT INTO auctions.auction_participants (auction_id, user_id, deposit_id, eligible, registered_at)
         VALUES ($1, $2, $3, TRUE, NOW())
         ON CONFLICT (auction_id, user_id) DO UPDATE SET
           deposit_id = EXCLUDED.deposit_id,
           eligible = TRUE,
           revoked_at = NULL,
           revoke_reason = NULL`,
        [payment.auctionId, payment.userId, savedDeposit.id],
      );

      this.logger.log(
        JSON.stringify({
          event: 'deposit_and_participant_created_3ds',
          payment_id: payment.id,
          deposit_id: savedDeposit.id,
          auction_id: payment.auctionId,
          user_id: payment.userId,
        }),
      );
    } catch (err) {
      this.logger.error(
        JSON.stringify({
          event: 'CRITICAL_deposit_creation_failed_3ds',
          payment_id: payment.id,
          auction_id: payment.auctionId,
          error: (err as Error).message,
        }),
      );
    }
  }

  /** Extract payment ID from provider-specific callback payload */
  private extractPaymentId(provider: string, body: Record<string, unknown>): string | null {
    switch (provider) {
      case 'paytr':
        return (body.merchant_oid as string) || null;
      case 'iyzico':
        return (body.paymentId as string) || null;
      case 'moka':
        return (body.OtherTrxCode as string) || null;
      default:
        return (body.paymentId as string) || null;
    }
  }

  /**
   * Cross-check callback amount against DB payment amount.
   * Returns mismatch details if amounts differ, null if OK.
   */
  checkAmountMismatch(
    provider: string,
    body: Record<string, unknown>,
    payment: Payment,
  ): { expected_amount: string; callback_amount: string } | null {
    const expectedCents = Math.round(parseFloat(payment.amount) * 100);

    let callbackCents: number | null = null;

    if (provider === 'paytr') {
      // PayTR sends total_amount in kuruş (integer cents string)
      const raw = body.total_amount as string | undefined;
      if (raw) {
        callbackCents = parseInt(raw, 10);
      }
    } else if (provider === 'iyzico') {
      // iyzico sends paidPrice as decimal string (e.g. "100.50")
      const raw = body.paidPrice as string | undefined;
      if (raw) {
        callbackCents = Math.round(parseFloat(raw) * 100);
      }
    }

    if (callbackCents === null) {
      // Amount field missing from callback — reject as tampered
      return {
        expected_amount: expectedCents.toString(),
        callback_amount: 'missing',
      };
    }

    if (isNaN(callbackCents) || callbackCents !== expectedCents) {
      return {
        expected_amount: expectedCents.toString(),
        callback_amount: (callbackCents || 0).toString(),
      };
    }

    return null;
  }
}
