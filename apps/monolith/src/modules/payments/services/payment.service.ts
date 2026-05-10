import {
  Injectable,
  Logger,
  Inject,
  Optional,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  PaymentLedger,
  LedgerEvent,
  PaymentStatus,
  IPosGateway,
  POS_GATEWAY,
  ProvisionInitiationResponse,
} from '@nettapu/shared';
import { ConfigService } from '@nestjs/config';
import { Deposit } from '@nettapu/shared';
import { Payment } from '../entities/payment.entity';
import { PosTransaction } from '../entities/pos-transaction.entity';
import { IdempotencyKey } from '../entities/idempotency-key.entity';
import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import { ListPaymentsQueryDto } from '../dto/list-payments-query.dto';
import { MetricsService } from '../../../metrics/metrics.service';
import { createHash } from 'crypto';

const IDEMPOTENCY_TTL_HOURS = 72;

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(PosTransaction)
    private readonly posTxRepo: Repository<PosTransaction>,
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyRepo: Repository<IdempotencyKey>,
    @InjectRepository(Deposit)
    private readonly depositRepo: Repository<Deposit>,
    @Inject(POS_GATEWAY)
    private readonly posGateway: IPosGateway,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  private get provider(): string {
    return this.config.get<string>('POS_PROVIDER', 'mock');
  }

  // ── Initiate (Provision) ───────────────────────────────────
  // C5 fix: idempotency key saved in Phase 1 (same TX as Payment)
  // so retries always find it. qr2 failure is non-fatal if POS
  // succeeded — logs CRITICAL for admin reconciliation.

  async initiate(dto: InitiatePaymentDto, userId: string): Promise<Payment> {
    // 1. Idempotency check (fast path)
    const existing = await this.idempotencyRepo.findOne({
      where: { key: dto.idempotencyKey },
    });

    if (existing) {
      const requestHash = this.hashRequest(dto);
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key already used with different parameters',
        );
      }
      const payment = await this.paymentRepo.findOne({
        where: { id: existing.responseBody.paymentId as string },
      });
      if (payment) return payment;
    }

    // 2. Phase 1: Create Payment + Ledger + IdempotencyKey (atomic)
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let payment: Payment;
    try {
      // Generate transfer code for bank transfers
      let description = dto.description ?? null;
      if (dto.paymentMethod === 'bank_transfer') {
        const auctionShort = (dto.auctionId ?? 'XXXX').slice(0, 4).toUpperCase();
        const userShort = userId.slice(0, 4).toUpperCase();
        const transferCode = `NT-${auctionShort}-${userShort}`;
        description = description ? `${description} | Kod: ${transferCode}` : `Kod: ${transferCode}`;
      }

      payment = qr.manager.create(Payment, {
        userId,
        parcelId: dto.parcelId,
        auctionId: dto.auctionId ?? null,
        amount: dto.amount,
        currency: dto.currency ?? 'TRY',
        status: PaymentStatus.PENDING,
        paymentMethod: dto.paymentMethod,
        description,
        idempotencyKey: dto.idempotencyKey,
      });
      payment = await qr.manager.save(Payment, payment);

      await qr.manager.save(
        PaymentLedger,
        qr.manager.create(PaymentLedger, {
          paymentId: payment.id,
          event: LedgerEvent.PAYMENT_INITIATED,
          amount: payment.amount,
          currency: payment.currency,
          metadata: { userId, parcelId: dto.parcelId },
        }),
      );

      // Idempotency key saved HERE (not in qr2) — retry always finds it
      await qr.manager.save(
        IdempotencyKey,
        qr.manager.create(IdempotencyKey, {
          key: dto.idempotencyKey,
          operationType: 'payment_initiation',
          requestHash: this.hashRequest(dto),
          responseBody: { paymentId: payment.id },
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3600_000),
        }),
      );

      await qr.commitTransaction();
      this.metrics?.paymentInitiatedTotal.inc({ provider: this.provider, currency: payment.currency });
    } catch (err) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }

      // Race-safe idempotency: PostgreSQL unique_violation (23505) means a
      // concurrent request already committed the payment. Look it up and
      // return it instead of surfacing a 500.
      // IMPORTANT: The early return here exits initiate() before POS
      // provisioning (step 3) and recordPosResult (step 4), guaranteeing
      // no duplicate POS calls or ledger writes.
      if ((err as any).code === '23505') {
        const raceWinner = await this.idempotencyRepo.findOne({
          where: { key: dto.idempotencyKey },
        });
        if (raceWinner) {
          const requestHash = this.hashRequest(dto);
          if (raceWinner.requestHash !== requestHash) {
            throw new ConflictException(
              'Idempotency key already used with different parameters',
            );
          }
          const existingPayment = await this.paymentRepo.findOne({
            where: { id: raceWinner.responseBody.paymentId as string },
          });
          if (existingPayment) {
            this.logger.log(
              JSON.stringify({
                event: 'idempotency_race_resolved',
                idempotency_key: dto.idempotencyKey,
                payment_id: existingPayment.id,
                status: existingPayment.status,
                resolution: 'returned_existing_payment',
              }),
            );
            return existingPayment;
          }
        }
        // Fallthrough: 23505 but winner not found yet (should not happen
        // since both rows are in the same TX). Throw a clear error.
        this.logger.error(
          JSON.stringify({
            event: 'idempotency_race_lookup_failed',
            idempotency_key: dto.idempotencyKey,
          }),
        );
        throw new ConflictException(
          'Payment creation conflict — please retry',
        );
      }

      throw err;
    } finally {
      await qr.release();
    }

    // 3. POS provision call (outside TX — external side effect)
    // Uses initiateProvision() which supports 3DS flows.
    let initResult: ProvisionInitiationResponse;
    const posStart = Date.now();
    try {
      initResult = await this.posGateway.initiateProvision({
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        idempotencyKey: dto.idempotencyKey,
        cardToken: dto.cardToken,
        buyer: dto.buyer,
      });
      this.metrics?.posCallDurationMs.observe({ provider: this.provider, method: 'initiateProvision' }, Date.now() - posStart);
      this.metrics?.posCallTotal.inc({ provider: this.provider, method: 'initiateProvision', status: 'success' });
    } catch (posErr) {
      this.metrics?.posCallDurationMs.observe({ provider: this.provider, method: 'initiateProvision' }, Date.now() - posStart);
      this.metrics?.posCallTotal.inc({ provider: this.provider, method: 'initiateProvision', status: 'error' });
      // POS call threw — record failure in DB, return payment as-is
      this.logger.error(
        JSON.stringify({
          event: 'pos_provision_exception',
          payment_id: payment.id,
          error: (posErr as Error).message,
        }),
      );
      await this.recordPosResult(payment, {
        success: false,
        posReference: null,
        message: (posErr as Error).message,
      });
      return (await this.paymentRepo.findOne({ where: { id: payment.id } })) ?? payment;
    }

    // 4. Handle provision result based on status
    if (initResult.status === 'requires_3ds') {
      // 3DS flow: set status to awaiting_3ds, store token, return 3DS data
      try {
        await this.record3dsInitiated(payment, initResult);
      } catch (dbErr) {
        this.logger.error(
          JSON.stringify({
            event: 'CRITICAL_3ds_initiated_db_failure',
            payment_id: payment.id,
            db_error: (dbErr as Error).message,
          }),
        );
        throw dbErr;
      }

      const updatedPayment = await this.paymentRepo.findOne({ where: { id: payment.id } });
      const result = updatedPayment ?? payment;

      this.metrics?.threeDsInitiatedTotal.inc({ provider: this.provider });

      this.logger.log(
        JSON.stringify({
          event: 'payment_3ds_initiated',
          payment_id: result.id,
          status: result.status,
        }),
      );

      // Return payment with 3DS data attached for the controller to relay
      return Object.assign(result, {
        threeDsHtmlContent: initResult.threeDsHtmlContent,
        threeDsRedirectUrl: initResult.threeDsRedirectUrl,
        posTransactionToken: initResult.posTransactionToken,
      });
    }

    // Non-3DS: completed or failed — record as before
    const posResult = {
      success: initResult.status === 'completed',
      posReference: initResult.posReference,
      message: initResult.message,
    };

    try {
      await this.recordPosResult(payment, posResult);
    } catch (dbErr) {
      this.logger.error(
        JSON.stringify({
          event: 'CRITICAL_pos_success_db_failure',
          payment_id: payment.id,
          pos_success: posResult.success,
          pos_reference: posResult.posReference,
          db_error: (dbErr as Error).message,
        }),
      );
      throw dbErr;
    }

    const finalPayment = await this.paymentRepo.findOne({ where: { id: payment.id } });
    payment = finalPayment ?? payment;

    this.logger.log(
      JSON.stringify({
        event: 'payment_initiated',
        payment_id: payment.id,
        status: payment.status,
        amount: payment.amount,
      }),
    );

    return payment;
  }

  private async record3dsInitiated(
    payment: Payment,
    initResult: ProvisionInitiationResponse,
  ): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const locked = await qr.manager
        .createQueryBuilder(Payment, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: payment.id })
        .getOne();

      if (!locked || locked.status !== PaymentStatus.PENDING) {
        await qr.rollbackTransaction();
        return;
      }

      locked.status = PaymentStatus.AWAITING_3DS;
      locked.posTransactionToken = initResult.posTransactionToken ?? null;
      locked.threeDsInitiatedAt = new Date();
      await qr.manager.save(Payment, locked);

      await qr.manager.save(
        PaymentLedger,
        qr.manager.create(PaymentLedger, {
          paymentId: payment.id,
          event: LedgerEvent.THREE_DS_INITIATED,
          amount: payment.amount,
          currency: payment.currency,
          metadata: {
            posTransactionToken: initResult.posTransactionToken,
          },
        }),
      );

      await qr.commitTransaction();
    } catch (err) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async recordPosResult(
    payment: Payment,
    posResult: { success: boolean; posReference: string | null; message: string },
  ): Promise<void> {
    const qr2 = this.dataSource.createQueryRunner();
    await qr2.connect();
    await qr2.startTransaction();

    try {
      const locked = await qr2.manager
        .createQueryBuilder(Payment, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: payment.id })
        .getOne();

      if (!locked || locked.status !== PaymentStatus.PENDING) {
        await qr2.rollbackTransaction();
        return;
      }

      // POS transaction record
      await qr2.manager.save(
        PosTransaction,
        qr2.manager.create(PosTransaction, {
          paymentId: payment.id,
          provider: this.config.get<string>('POS_PROVIDER', 'mock'),
          externalId: posResult.posReference,
          amount: payment.amount,
          currency: payment.currency,
          status: posResult.success ? 'provisioned' : 'failed',
          responsePayload: posResult as unknown as Record<string, unknown>,
        }),
      );

      if (posResult.success) {
        locked.status = PaymentStatus.PROVISIONED;
        await qr2.manager.save(Payment, locked);

        await qr2.manager.save(
          PaymentLedger,
          qr2.manager.create(PaymentLedger, {
            paymentId: payment.id,
            event: LedgerEvent.PAYMENT_PROVISIONED,
            amount: payment.amount,
            currency: payment.currency,
            metadata: { posReference: posResult.posReference },
          }),
        );

        this.metrics?.paymentProvisionedTotal.inc({ provider: this.provider, currency: payment.currency });

        // ── Create Deposit + AuctionParticipant if this is an auction deposit ──
        if (locked.auctionId) {
          await this.createDepositAndParticipant(qr2.manager, locked);
        }

        // ── Referral reward: first successful payment by an invited user ──
        await this.tryGrantReferralReward(qr2.manager, locked);
      } else {
        locked.status = PaymentStatus.FAILED;
        await qr2.manager.save(Payment, locked);

        await qr2.manager.save(
          PaymentLedger,
          qr2.manager.create(PaymentLedger, {
            paymentId: payment.id,
            event: LedgerEvent.PAYMENT_FAILED,
            amount: payment.amount,
            currency: payment.currency,
            metadata: { reason: posResult.message },
          }),
        );

        this.metrics?.paymentFailedTotal.inc({ provider: this.provider, reason: 'pos_error' });
      }

      await qr2.commitTransaction();
    } catch (err) {
      if (qr2.isTransactionActive) {
        await qr2.rollbackTransaction();
      }
      throw err;
    } finally {
      await qr2.release();
    }
  }

  // ── Deposit + Participant creation (auction payments) ──────
  private async createDepositAndParticipant(
    manager: import('typeorm').EntityManager,
    payment: Payment,
  ): Promise<void> {
    try {
      // 1. Create Deposit record in payments.deposits
      const deposit = manager.create(Deposit, {
        userId: payment.userId,
        auctionId: payment.auctionId!,
        amount: payment.amount,
        currency: payment.currency,
        status: 'collected',
        paymentMethod: payment.paymentMethod ?? 'credit_card',
        posProvider: this.provider !== 'mock' ? this.provider : null,
        posTransactionId: null,
        idempotencyKey: payment.idempotencyKey,
      });
      const savedDeposit = await manager.save(Deposit, deposit);

      // 2. Create AuctionParticipant in auctions.auction_participants (cross-schema, raw SQL)
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
          event: 'deposit_and_participant_created',
          payment_id: payment.id,
          deposit_id: savedDeposit.id,
          auction_id: payment.auctionId,
          user_id: payment.userId,
        }),
      );
    } catch (err) {
      // Log but don't fail the payment — deposit can be reconciled manually
      this.logger.error(
        JSON.stringify({
          event: 'CRITICAL_deposit_creation_failed',
          payment_id: payment.id,
          auction_id: payment.auctionId,
          error: (err as Error).message,
        }),
      );
    }
  }

  // ── Verify Bank Transfer ────────────────────────────────────
  // Admin approves a pending bank transfer → mark as completed directly
  async verifyBankTransfer(paymentId: string): Promise<Payment> {
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
        throw new NotFoundException(`Payment ${paymentId} not found`);
      }
      if (locked.paymentMethod !== 'bank_transfer') {
        throw new BadRequestException('Bu işlem sadece havale/EFT ödemeleri için geçerlidir');
      }
      if (locked.status !== PaymentStatus.PENDING) {
        throw new BadRequestException(`Ödeme durumu '${locked.status}' olduğu için onaylanamaz`);
      }

      // Two-step transition: pending → provisioned → completed (enforced by DB trigger)
      locked.status = PaymentStatus.PROVISIONED;
      await qr.manager.save(Payment, locked);

      locked.status = PaymentStatus.COMPLETED;
      await qr.manager.save(Payment, locked);

      // If this payment is for an auction deposit, create deposit + participant
      if (locked.auctionId) {
        // Upsert deposit
        const existingDeposit = await qr.manager.query(
          `SELECT id FROM payments.deposits WHERE auction_id = $1 AND user_id = $2 LIMIT 1`,
          [locked.auctionId, locked.userId],
        );
        let depositId: string;
        if (existingDeposit.length > 0) {
          depositId = existingDeposit[0].id;
          await qr.manager.query(
            `UPDATE payments.deposits SET status = 'collected' WHERE id = $1`,
            [depositId],
          );
        } else {
          const insertResult = await qr.manager.query(
            `INSERT INTO payments.deposits (user_id, auction_id, amount, currency, status, payment_method, idempotency_key)
             VALUES ($1, $2, $3, $4, 'collected', 'bank_transfer', $5)
             RETURNING id`,
            [locked.userId, locked.auctionId, locked.amount, locked.currency, locked.idempotencyKey],
          );
          depositId = insertResult[0].id;
        }

        // Upsert auction participant (eligible = true)
        await qr.manager.query(
          `INSERT INTO auctions.auction_participants (auction_id, user_id, deposit_id, eligible, registered_at)
           VALUES ($1, $2, $3, TRUE, NOW())
           ON CONFLICT (auction_id, user_id) DO UPDATE SET
             deposit_id = EXCLUDED.deposit_id,
             eligible = TRUE,
             revoked_at = NULL,
             revoke_reason = NULL`,
          [locked.auctionId, locked.userId, depositId],
        );

        this.logger.log(`Bank transfer: deposit + participant created for auction=${locked.auctionId} user=${locked.userId}`);
      }

      await qr.commitTransaction();
      this.logger.log(`Bank transfer ${paymentId} verified: pending → provisioned → completed`);
      return locked;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── Capture ────────────────────────────────────────────────
  // Lock-first: acquire FOR UPDATE before POS call to prevent
  // double-capture and capture/cancel races (C3+C4).

  async capture(paymentId: string): Promise<Payment> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // 1. Lock payment
      const locked = await qr.manager
        .createQueryBuilder(Payment, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: paymentId })
        .getOne();

      if (!locked) {
        throw new NotFoundException(`Payment ${paymentId} not found`);
      }
      if (locked.status !== PaymentStatus.PROVISIONED) {
        throw new BadRequestException(
          `Cannot capture payment in status: ${locked.status}`,
        );
      }

      // 2. Find POS reference under lock
      const posTx = await qr.manager.findOne(PosTransaction, {
        where: { paymentId, status: 'provisioned' },
      });
      if (!posTx?.externalId) {
        throw new BadRequestException('No POS provision reference found');
      }

      // 3. POS capture call (holding lock — financial correctness > perf)
      const captureStart = Date.now();
      const captureResult = await this.posGateway.capture({
        paymentId,
        posReference: posTx.externalId,
        amount: locked.amount,
        currency: locked.currency,
        idempotencyKey: `capture:${paymentId}`,
      });
      this.metrics?.posCallDurationMs.observe({ provider: this.provider, method: 'capture' }, Date.now() - captureStart);
      this.metrics?.posCallTotal.inc({ provider: this.provider, method: 'capture', status: captureResult.success ? 'success' : 'error' });

      if (!captureResult.success) {
        throw new BadRequestException(
          `POS capture failed: ${captureResult.message}`,
        );
      }

      // 4. Record result
      locked.status = PaymentStatus.COMPLETED;
      await qr.manager.save(Payment, locked);

      await qr.manager.save(
        PosTransaction,
        qr.manager.create(PosTransaction, {
          paymentId,
          provider: posTx.provider,
          externalId: captureResult.posReference,
          amount: locked.amount,
          currency: locked.currency,
          status: 'captured',
          responsePayload: captureResult as unknown as Record<string, unknown>,
        }),
      );

      await qr.manager.save(
        PaymentLedger,
        qr.manager.create(PaymentLedger, {
          paymentId,
          event: LedgerEvent.PAYMENT_CAPTURED,
          amount: locked.amount,
          currency: locked.currency,
          metadata: { posReference: captureResult.posReference },
        }),
      );

      await qr.commitTransaction();
      this.metrics?.paymentCapturedTotal.inc({ provider: this.provider });
      return locked;
    } catch (err) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── Cancel Provision ───────────────────────────────────────
  // Lock-first: same pattern as capture.

  async cancel(paymentId: string): Promise<Payment> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // 1. Lock payment
      const locked = await qr.manager
        .createQueryBuilder(Payment, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: paymentId })
        .getOne();

      if (!locked) {
        throw new NotFoundException(`Payment ${paymentId} not found`);
      }
      if (locked.status !== PaymentStatus.PROVISIONED) {
        throw new BadRequestException(
          `Cannot cancel payment in status: ${locked.status}`,
        );
      }

      // 2. Find POS reference under lock
      const posTx = await qr.manager.findOne(PosTransaction, {
        where: { paymentId, status: 'provisioned' },
      });
      if (!posTx?.externalId) {
        throw new BadRequestException('No POS provision reference found');
      }

      // 3. POS cancel call (holding lock)
      const cancelStart = Date.now();
      const cancelResult = await this.posGateway.cancelProvision({
        paymentId,
        posReference: posTx.externalId,
        idempotencyKey: `cancel:${paymentId}`,
      });
      this.metrics?.posCallDurationMs.observe({ provider: this.provider, method: 'cancelProvision' }, Date.now() - cancelStart);
      this.metrics?.posCallTotal.inc({ provider: this.provider, method: 'cancelProvision', status: cancelResult.success ? 'success' : 'error' });

      if (!cancelResult.success) {
        throw new BadRequestException(
          `POS cancel failed: ${cancelResult.message}`,
        );
      }

      // 4. Record result
      locked.status = PaymentStatus.CANCELLED;
      await qr.manager.save(Payment, locked);

      await qr.manager.save(
        PaymentLedger,
        qr.manager.create(PaymentLedger, {
          paymentId,
          event: LedgerEvent.PAYMENT_PROVISION_CANCELLED,
          amount: locked.amount,
          currency: locked.currency,
        }),
      );

      await qr.commitTransaction();
      this.metrics?.paymentCancelledTotal.inc({ provider: this.provider });
      return locked;
    } catch (err) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── Queries ────────────────────────────────────────────────

  async findById(id: string): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }

  async findByUser(
    userId: string,
    query: ListPaymentsQueryDto,
  ): Promise<{ data: Payment[]; meta: { total: number; page: number; limit: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .where('p.user_id = :userId', { userId });

    if (query.status) {
      qb.andWhere('p.status = :status', { status: query.status });
    }

    if (query.auctionId) {
      qb.andWhere('p.auction_id = :auctionId', { auctionId: query.auctionId });
    }

    qb.orderBy('p.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, page, limit } };
  }

  async findAllAdmin(
    query: ListPaymentsQueryDto & { paymentMethod?: string; sortBy?: string; sortOrder?: string },
  ): Promise<{ data: Payment[]; meta: { total: number; page: number; limit: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.paymentRepo
      .createQueryBuilder('p');

    if (query.status) {
      qb.andWhere('p.status = :status', { status: query.status });
    }
    if (query.auctionId) {
      qb.andWhere('p.auction_id = :auctionId', { auctionId: query.auctionId });
    }
    if (query.paymentMethod) {
      qb.andWhere('p.payment_method = :pm', { pm: query.paymentMethod });
    }

    const sortCol = query.sortBy === 'createdAt' ? 'p.created_at' : 'p.created_at';
    const sortDir = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(sortCol, sortDir)
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, page, limit } };
  }

  /**
   * Grant referral credits when a referred user makes their first successful
   * payment. Idempotent — duplicate inserts are absorbed by the unique index
   * on (user_id, source_user_id, trigger_event).
   */
  private async tryGrantReferralReward(
    manager: import('typeorm').EntityManager,
    payment: Payment,
  ): Promise<void> {
    try {
      const user = await manager.query<{ referred_by: string | null }[]>(
        'SELECT referred_by FROM auth.users WHERE id = $1',
        [payment.userId],
      );
      const referrerId = user?.[0]?.referred_by;
      if (!referrerId) return;

      const REFEREE_AMOUNT = 250;
      const REFERRER_AMOUNT = 250;
      const TRIGGER = 'first_deposit';
      const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

      // ON CONFLICT DO NOTHING — idempotent grant
      await manager.query(
        `INSERT INTO crm.referral_credits
           (user_id, source_user_id, type, amount, currency, status, trigger_event, trigger_payment_id, expires_at, notes)
         VALUES
           ($1, $1, 'discount', $2, 'TRY', 'available', $3, $4, $5, 'İlk depozit kuponu (paylaş-kazan)'),
           ($6, $1, 'discount', $7, 'TRY', 'available', $3, $4, $5, 'Davet ettiğiniz kullanıcı ilk depozit ödemesini yaptı')
         ON CONFLICT (user_id, source_user_id, trigger_event) DO NOTHING`,
        [
          payment.userId,
          REFEREE_AMOUNT.toFixed(2),
          TRIGGER,
          payment.id,
          expiresAt,
          referrerId,
          REFERRER_AMOUNT.toFixed(2),
        ],
      );

      this.logger.log(
        JSON.stringify({
          event: 'referral_reward_check',
          referee: payment.userId,
          referrer: referrerId,
          payment_id: payment.id,
        }),
      );
    } catch (err) {
      // Non-fatal: log and continue
      this.logger.warn(
        `Referral grant failed for payment ${payment.id}: ${(err as Error).message}`,
      );
    }
  }

  // ── Mail Order (admin-only) ────────────────────────────────

  /**
   * Admin-initiated MOTO transaction. Bypasses 3DS — requires the operator
   * to have authenticated the cardholder over the phone.
   *
   * Card data is forwarded to the provider as a base64 JSON cardToken in
   * the format adapters expect: {n,m,y,c,h}. Card data is NEVER stored
   * in our DB — only the masked PAN ("123456******1234") + ledger entry.
   */
  async initiateMailOrder(
    dto: import('../dto/initiate-mail-order.dto').InitiateMailOrderDto,
    adminUserId: string,
  ): Promise<Payment> {
    // Encode card details as the opaque token adapters parse
    const cardToken = Buffer.from(
      JSON.stringify({
        n: dto.cardNumber,
        m: dto.expMonth,
        y: dto.expYear,
        c: dto.cvc,
        h: dto.cardHolder,
      }),
    ).toString('base64');

    const masked = `${dto.cardNumber.slice(0, 6)}******${dto.cardNumber.slice(-4)}`;
    const description = dto.description ?? `MOTO • ${masked} • op:${adminUserId.slice(0, 8)}`;

    // 1. Create Payment row in pending state
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let payment: Payment;
    try {
      payment = qr.manager.create(Payment, {
        userId: dto.userId,
        parcelId: dto.parcelId ?? null,
        auctionId: dto.auctionId ?? null,
        amount: dto.amount,
        currency: dto.currency ?? 'TRY',
        status: PaymentStatus.PENDING,
        paymentMethod: 'mail_order',
        description,
        idempotencyKey: dto.idempotencyKey,
      });
      payment = await qr.manager.save(Payment, payment);

      await qr.manager.save(
        PaymentLedger,
        qr.manager.create(PaymentLedger, {
          paymentId: payment.id,
          event: LedgerEvent.PAYMENT_INITIATED,
          amount: payment.amount,
          currency: payment.currency,
          metadata: {
            channel: 'mail_order',
            masked_pan: masked,
            card_holder: dto.cardHolder,
            operator_id: adminUserId,
            operator_notes: dto.operatorNotes,
          },
        }),
      );

      await qr.manager.save(
        IdempotencyKey,
        qr.manager.create(IdempotencyKey, {
          key: dto.idempotencyKey,
          operationType: 'mail_order_initiation',
          requestHash: createHash('sha256')
            .update(`${dto.userId}|${dto.amount}|${masked}`)
            .digest('hex'),
          responseBody: { paymentId: payment.id },
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3600_000),
        }),
      );

      await qr.commitTransaction();
    } catch (err) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    // 2. Call POS with isMoto flag
    let initResult: ProvisionInitiationResponse;
    try {
      initResult = await this.posGateway.initiateProvision({
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        idempotencyKey: dto.idempotencyKey,
        cardToken,
        isMoto: true,
        buyer: dto.buyerEmail
          ? {
              email: dto.buyerEmail,
              firstName: dto.cardHolder.split(' ').slice(0, -1).join(' ') || dto.cardHolder,
              lastName: dto.cardHolder.split(' ').slice(-1).join(''),
              ip: '0.0.0.0',
              phone: dto.buyerPhone,
            }
          : undefined,
      });
    } catch (posErr) {
      await this.recordPosResult(payment, {
        success: false,
        posReference: null,
        message: (posErr as Error).message,
      });
      return (await this.paymentRepo.findOne({ where: { id: payment.id } })) ?? payment;
    }

    const success = initResult.status === 'completed';
    await this.recordPosResult(payment, {
      success,
      posReference: initResult.posReference,
      message: initResult.message,
    });

    return (await this.paymentRepo.findOne({ where: { id: payment.id } })) ?? payment;
  }

  // ── Helpers ────────────────────────────────────────────────

  private hashRequest(dto: InitiatePaymentDto): string {
    const payload = JSON.stringify({
      parcelId: dto.parcelId,
      amount: dto.amount,
      currency: dto.currency,
      paymentMethod: dto.paymentMethod,
    });
    return createHash('sha256').update(payload).digest('hex');
  }
}
