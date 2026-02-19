import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { Auction } from '../entities/auction.entity';
import { AuctionParticipant } from '../entities/auction-participant.entity';
import { SettlementManifest } from '../entities/settlement-manifest.entity';
import { Deposit } from '../entities/deposit.entity';
import { DepositTransition } from '../entities/deposit-transition.entity';
import { PaymentLedger } from '../entities/payment-ledger.entity';
import { Refund } from '../entities/refund.entity';
import { AuctionStatus } from '@nettapu/shared';
import {
  PAYMENT_SERVICE,
  IPaymentService,
  CircuitOpenError,
} from './payment.service';
import { executeWithRetry } from '../utils/db-retry.util';
import { MetricsService } from '../../../metrics/metrics.service';

// ── Manifest JSONB types ──────────────────────────────────────

export interface SettlementManifestItem {
  item_id: string;
  deposit_id: string;
  user_id: string;
  action: 'capture' | 'refund';
  amount: string;
  currency: string;
  status: 'pending' | 'sent' | 'acknowledged' | 'failed';
  idempotency_key: string;
  pos_reference: string | null;
  sent_at: string | null;
  acknowledged_at: string | null;
  failure_reason: string | null;
  retry_count: number;
}

export interface SettlementManifestData {
  auction_id: string;
  winner_id: string | null;
  final_price: string | null;
  currency: string;
  created_at: string;
  items: SettlementManifestItem[];
}

// ── Constants ─────────────────────────────────────────────────

export const MAX_RETRIES = 3;
const MANIFEST_EXPIRY_HOURS = 48;

/**
 * Max items to process per worker tick per manifest.
 * Prevents a single tick from running longer than the Redis lock TTL.
 * With real POS calls (2-5s each), 5 items ≈ 10-25s < 30s lock TTL.
 */
export const ITEMS_PER_TICK = 5;

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    @InjectRepository(Auction)
    private readonly auctionRepo: Repository<Auction>,
    @InjectRepository(AuctionParticipant)
    private readonly participantRepo: Repository<AuctionParticipant>,
    @InjectRepository(SettlementManifest)
    private readonly manifestRepo: Repository<SettlementManifest>,
    @InjectRepository(Deposit)
    private readonly depositRepo: Repository<Deposit>,
    private readonly dataSource: DataSource,
    @Inject(PAYMENT_SERVICE)
    private readonly paymentService: IPaymentService,
    private readonly metrics: MetricsService,
  ) {}

  // ── 1. Initiate Settlement ────────────────────────────────────

  async initiateSettlement(auctionId: string): Promise<SettlementManifest | null> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Pessimistic lock auction
      const auction = await qr.manager
        .createQueryBuilder(Auction, 'a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: auctionId })
        .getOne();

      if (!auction || auction.status !== AuctionStatus.ENDED) {
        await qr.rollbackTransaction();
        return null;
      }

      // Guard: no existing manifest (idempotency via UNIQUE constraint)
      const existingManifest = await qr.manager.findOne(SettlementManifest, {
        where: { auctionId },
      });
      if (existingManifest) {
        await qr.rollbackTransaction();
        this.logger.warn(
          JSON.stringify({
            event: 'settlement_duplicate_manifest',
            auction_id: auctionId,
            existing_manifest_id: existingManifest.id,
          }),
        );
        return null;
      }

      // Batch load: participants first, then all deposits in one query
      const participants = await qr.manager.find(AuctionParticipant, {
        where: { auctionId, eligible: true },
      });

      // Batch load all referenced deposits (single query with IN clause)
      const depositIds = participants.map((p) => p.depositId);
      const deposits = depositIds.length > 0
        ? await qr.manager.find(Deposit, { where: { id: In(depositIds) } })
        : [];

      const depositMap = new Map<string, Deposit>();
      for (const d of deposits) {
        depositMap.set(d.id, d);
      }

      const items: SettlementManifestItem[] = [];

      for (const participant of participants) {
        const deposit = depositMap.get(participant.depositId);

        if (!deposit || deposit.status !== 'held') {
          this.logger.warn(
            JSON.stringify({
              event: 'settlement_skip_participant',
              auction_id: auctionId,
              user_id: participant.userId,
              deposit_id: participant.depositId,
              deposit_status: deposit?.status ?? 'not_found',
            }),
          );
          continue;
        }

        const isWinner = auction.winnerId === participant.userId;
        const action: 'capture' | 'refund' = isWinner ? 'capture' : 'refund';

        items.push({
          item_id: randomUUID(),
          deposit_id: deposit.id,
          user_id: participant.userId,
          action,
          amount: deposit.amount,
          currency: deposit.currency,
          status: 'pending',
          idempotency_key: `settlement:${auctionId}:${deposit.id}:${action}`,
          pos_reference: null,
          sent_at: null,
          acknowledged_at: null,
          failure_reason: null,
          retry_count: 0,
        });
      }

      const manifestData: SettlementManifestData = {
        auction_id: auctionId,
        winner_id: auction.winnerId,
        final_price: auction.finalPrice,
        currency: auction.currency,
        created_at: new Date().toISOString(),
        items,
      };

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + MANIFEST_EXPIRY_HOURS);

      const manifest = qr.manager.create(SettlementManifest, {
        auctionId,
        manifestData: manifestData as unknown as Record<string, unknown>,
        status: 'active',
        itemsTotal: items.length,
        itemsAcknowledged: 0,
        expiresAt,
      });

      await qr.manager.save(SettlementManifest, manifest);

      // Transition auction: ENDED → SETTLING
      auction.status = AuctionStatus.SETTLING as string;
      await qr.manager.save(Auction, auction);

      await qr.commitTransaction();

      this.logger.log(
        JSON.stringify({
          event: 'settlement_started',
          auction_id: auctionId,
          manifest_id: manifest.id,
          items_total: items.length,
          winner_id: auction.winnerId ?? null,
          final_price: auction.finalPrice ?? null,
        }),
      );

      return manifest;
    } catch (err) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── 2. Process Manifest Item ──────────────────────────────────

  async processManifestItem(
    manifest: SettlementManifest,
    item: SettlementManifestItem,
  ): Promise<SettlementManifestItem> {
    const result = item.action === 'capture'
      ? await this.processCaptureItem(manifest, item)
      : await this.processRefundItem(manifest, item);

    if (result.status === 'failed') {
      this.metrics.settlementItemFailuresTotal.inc({ action: result.action });
    }

    return result;
  }

  private async processCaptureItem(
    manifest: SettlementManifest,
    item: SettlementManifestItem,
  ): Promise<SettlementManifestItem> {
    // Re-read deposit current state (outside TX for fresh read)
    const deposit = await this.depositRepo.findOne({ where: { id: item.deposit_id } });

    if (!deposit) {
      item.status = 'failed';
      item.failure_reason = 'Deposit not found';
      item.retry_count++;
      return item;
    }

    // Idempotent: already captured (POS succeeded, DB recorded on previous attempt)
    if (deposit.status === 'captured') {
      item.status = 'acknowledged';
      item.acknowledged_at = new Date().toISOString();
      this.logger.log(
        JSON.stringify({
          event: 'settlement_item_idempotent',
          action: 'capture',
          deposit_id: item.deposit_id,
          deposit_status: 'captured',
        }),
      );
      return item;
    }

    if (deposit.status !== 'held') {
      item.status = 'failed';
      item.failure_reason = `Unexpected deposit status: ${deposit.status}`;
      item.retry_count++;
      return item;
    }

    // Mark as sent before POS call
    item.status = 'sent';
    item.sent_at = new Date().toISOString();

    try {
      const result = await this.paymentService.captureDeposit({
        depositId: deposit.id,
        posTransactionId: deposit.posTransactionId,
        posProvider: deposit.posProvider,
        amount: deposit.amount,
        currency: deposit.currency,
        idempotencyKey: item.idempotency_key,
        metadata: { auctionId: manifest.auctionId, manifestId: manifest.id },
      });

      if (!result.success) {
        item.status = 'failed';
        item.failure_reason = result.message;
        item.retry_count++;
        return item;
      }

      item.pos_reference = result.posReference;

      // Record transition in DB (with transient failure retry)
      await executeWithRetry(
        () => this.recordCaptureInDb(deposit, item),
        { context: `capture_db:${item.deposit_id}` },
      );

      item.status = 'acknowledged';
      item.acknowledged_at = new Date().toISOString();
      return item;
    } catch (err) {
      // CircuitOpenError — POS was not called, safe to retry without re-check
      if (err instanceof CircuitOpenError) {
        item.status = 'failed';
        item.failure_reason = err.message;
        item.retry_count++;
        this.logger.warn(
          JSON.stringify({
            event: 'settlement_item_circuit_open',
            action: 'capture',
            deposit_id: item.deposit_id,
            retry_count: item.retry_count,
          }),
        );
        return item;
      }

      // CRITICAL: POS may have succeeded but DB write failed.
      // Re-check deposit status to detect this case.
      const recheckDeposit = await this.depositRepo.findOne({ where: { id: item.deposit_id } });
      if (recheckDeposit?.status === 'captured') {
        // POS call succeeded AND DB was somehow updated (or another instance handled it).
        item.status = 'acknowledged';
        item.acknowledged_at = new Date().toISOString();
        this.logger.warn(
          JSON.stringify({
            event: 'settlement_item_recovered',
            action: 'capture',
            deposit_id: item.deposit_id,
            error: (err as Error).message,
          }),
        );
        return item;
      }

      item.status = 'failed';
      item.failure_reason = (err as Error).message;
      item.retry_count++;
      this.logger.error(
        JSON.stringify({
          event: 'settlement_item_failed',
          action: 'capture',
          deposit_id: item.deposit_id,
          retry_count: item.retry_count,
          max_retries: MAX_RETRIES,
          error: (err as Error).message,
        }),
      );
      return item;
    }
  }

  private async recordCaptureInDb(
    deposit: Deposit,
    item: SettlementManifestItem,
  ): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Lock deposit for atomic state transition
      const locked = await qr.manager
        .createQueryBuilder(Deposit, 'd')
        .setLock('pessimistic_write')
        .where('d.id = :id', { id: deposit.id })
        .getOne();

      if (!locked || locked.status !== 'held') {
        // Already transitioned (idempotent) — not an error
        await qr.rollbackTransaction();
        return;
      }

      // Transition: held → captured (DB trigger validates)
      locked.status = 'captured';
      await qr.manager.save(Deposit, locked);

      // Append deposit transition (audit trail)
      await qr.manager.save(DepositTransition, qr.manager.create(DepositTransition, {
        depositId: deposit.id,
        fromStatus: 'held',
        toStatus: 'captured',
        event: 'deposit_captured',
        reason: 'Settlement capture',
        metadata: {
          auctionId: item.idempotency_key.split(':')[1],
          idempotencyKey: item.idempotency_key,
          posReference: item.pos_reference,
        },
      }));

      // Append payment ledger (financial record)
      await qr.manager.save(PaymentLedger, qr.manager.create(PaymentLedger, {
        depositId: deposit.id,
        event: 'deposit_captured',
        amount: deposit.amount,
        currency: deposit.currency,
        metadata: {
          auctionId: item.idempotency_key.split(':')[1],
          idempotencyKey: item.idempotency_key,
          posReference: item.pos_reference,
        },
      }));

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

  private async processRefundItem(
    manifest: SettlementManifest,
    item: SettlementManifestItem,
  ): Promise<SettlementManifestItem> {
    const deposit = await this.depositRepo.findOne({ where: { id: item.deposit_id } });

    if (!deposit) {
      item.status = 'failed';
      item.failure_reason = 'Deposit not found';
      item.retry_count++;
      return item;
    }

    // Idempotent: already fully refunded
    if (deposit.status === 'refunded') {
      item.status = 'acknowledged';
      item.acknowledged_at = new Date().toISOString();
      this.logger.log(
        JSON.stringify({
          event: 'settlement_item_idempotent',
          action: 'refund',
          deposit_id: item.deposit_id,
          deposit_status: 'refunded',
        }),
      );
      return item;
    }

    // Crash recovery: POS call may have succeeded but worker crashed before DB update.
    // Deposit is still refund_pending — skip initiation, retry POS call.
    if (deposit.status === 'refund_pending') {
      return this.executeRefundPosCall(manifest, deposit, item);
    }

    if (deposit.status !== 'held') {
      item.status = 'failed';
      item.failure_reason = `Unexpected deposit status: ${deposit.status}`;
      item.retry_count++;
      return item;
    }

    // Step 1: Transition held → refund_pending + create refund record (atomic TX, with retry)
    const initiated = await executeWithRetry(
      () => this.recordRefundInitiationInDb(deposit, item),
      { context: `refund_init_db:${item.deposit_id}` },
    );
    if (!initiated) {
      // Deposit was concurrently transitioned — re-read and check
      const recheck = await this.depositRepo.findOne({ where: { id: item.deposit_id } });
      if (recheck?.status === 'refunded') {
        item.status = 'acknowledged';
        item.acknowledged_at = new Date().toISOString();
        return item;
      }
      if (recheck?.status === 'refund_pending') {
        return this.executeRefundPosCall(manifest, recheck, item);
      }
      item.status = 'failed';
      item.failure_reason = `Initiation failed: deposit status=${recheck?.status ?? 'unknown'}`;
      item.retry_count++;
      return item;
    }

    // Step 2: POS call + finalize (outside TX)
    return this.executeRefundPosCall(manifest, deposit, item);
  }

  /**
   * Returns true if initiation succeeded, false if deposit was already transitioned.
   */
  private async recordRefundInitiationInDb(
    deposit: Deposit,
    item: SettlementManifestItem,
  ): Promise<boolean> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const locked = await qr.manager
        .createQueryBuilder(Deposit, 'd')
        .setLock('pessimistic_write')
        .where('d.id = :id', { id: deposit.id })
        .getOne();

      if (!locked || locked.status !== 'held') {
        await qr.rollbackTransaction();
        return false;
      }

      // Transition: held → refund_pending (DB trigger validates)
      locked.status = 'refund_pending';
      await qr.manager.save(Deposit, locked);

      // Append deposit transition
      await qr.manager.save(DepositTransition, qr.manager.create(DepositTransition, {
        depositId: deposit.id,
        fromStatus: 'held',
        toStatus: 'refund_pending',
        event: 'deposit_refund_initiated',
        reason: 'Settlement refund',
        metadata: {
          auctionId: item.idempotency_key.split(':')[1],
          idempotencyKey: item.idempotency_key,
        },
      }));

      // Append payment ledger
      await qr.manager.save(PaymentLedger, qr.manager.create(PaymentLedger, {
        depositId: deposit.id,
        event: 'deposit_refund_initiated',
        amount: deposit.amount,
        currency: deposit.currency,
        metadata: {
          auctionId: item.idempotency_key.split(':')[1],
          idempotencyKey: item.idempotency_key,
        },
      }));

      // Create refund record
      await qr.manager.save(Refund, qr.manager.create(Refund, {
        depositId: deposit.id,
        amount: deposit.amount,
        currency: deposit.currency,
        reason: 'Auction settlement: losing bidder refund',
        status: 'pending',
        idempotencyKey: item.idempotency_key,
        initiatedAt: new Date(),
      }));

      await qr.commitTransaction();
      return true;
    } catch (err) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async executeRefundPosCall(
    manifest: SettlementManifest,
    deposit: Deposit,
    item: SettlementManifestItem,
  ): Promise<SettlementManifestItem> {
    item.status = 'sent';
    item.sent_at = new Date().toISOString();

    try {
      const result = await this.paymentService.refundDeposit({
        depositId: deposit.id,
        posTransactionId: deposit.posTransactionId,
        posProvider: deposit.posProvider,
        amount: deposit.amount,
        currency: deposit.currency,
        idempotencyKey: item.idempotency_key,
        metadata: { auctionId: manifest.auctionId, manifestId: manifest.id },
      });

      if (!result.success) {
        item.status = 'failed';
        item.failure_reason = result.message;
        item.retry_count++;
        return item;
      }

      item.pos_reference = result.posRefundId;

      // Finalize in DB: refund_pending → refunded (with transient failure retry)
      await executeWithRetry(
        () => this.recordRefundCompletionInDb(deposit, item, result.posRefundId),
        { context: `refund_complete_db:${item.deposit_id}` },
      );

      item.status = 'acknowledged';
      item.acknowledged_at = new Date().toISOString();
      return item;
    } catch (err) {
      // CircuitOpenError — POS was not called, safe to retry without re-check
      if (err instanceof CircuitOpenError) {
        item.status = 'failed';
        item.failure_reason = err.message;
        item.retry_count++;
        this.logger.warn(
          JSON.stringify({
            event: 'settlement_item_circuit_open',
            action: 'refund',
            deposit_id: item.deposit_id,
            retry_count: item.retry_count,
          }),
        );
        return item;
      }

      // CRITICAL: POS may have succeeded but DB write failed.
      // Re-check deposit status to detect this case.
      const recheckDeposit = await this.depositRepo.findOne({ where: { id: item.deposit_id } });
      if (recheckDeposit?.status === 'refunded') {
        item.status = 'acknowledged';
        item.acknowledged_at = new Date().toISOString();
        this.logger.warn(
          JSON.stringify({
            event: 'settlement_item_recovered',
            action: 'refund',
            deposit_id: item.deposit_id,
            error: (err as Error).message,
          }),
        );
        return item;
      }

      item.status = 'failed';
      item.failure_reason = (err as Error).message;
      item.retry_count++;
      this.logger.error(
        JSON.stringify({
          event: 'settlement_item_failed',
          action: 'refund',
          deposit_id: item.deposit_id,
          retry_count: item.retry_count,
          max_retries: MAX_RETRIES,
          error: (err as Error).message,
        }),
      );
      return item;
    }
  }

  private async recordRefundCompletionInDb(
    deposit: Deposit,
    item: SettlementManifestItem,
    posRefundId: string | null,
  ): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const locked = await qr.manager
        .createQueryBuilder(Deposit, 'd')
        .setLock('pessimistic_write')
        .where('d.id = :id', { id: deposit.id })
        .getOne();

      if (!locked || locked.status !== 'refund_pending') {
        // Already refunded (idempotent) — not an error
        await qr.rollbackTransaction();
        return;
      }

      // Transition: refund_pending → refunded (DB trigger validates)
      locked.status = 'refunded';
      await qr.manager.save(Deposit, locked);

      // Append deposit transition
      await qr.manager.save(DepositTransition, qr.manager.create(DepositTransition, {
        depositId: deposit.id,
        fromStatus: 'refund_pending',
        toStatus: 'refunded',
        event: 'deposit_refunded',
        reason: 'Settlement refund completed',
        metadata: {
          auctionId: item.idempotency_key.split(':')[1],
          idempotencyKey: item.idempotency_key,
          posRefundId,
        },
      }));

      // Append payment ledger
      await qr.manager.save(PaymentLedger, qr.manager.create(PaymentLedger, {
        depositId: deposit.id,
        event: 'deposit_refunded',
        amount: deposit.amount,
        currency: deposit.currency,
        metadata: {
          auctionId: item.idempotency_key.split(':')[1],
          idempotencyKey: item.idempotency_key,
          posRefundId,
        },
      }));

      // Update refund record
      await qr.manager
        .createQueryBuilder()
        .update(Refund)
        .set({
          status: 'completed',
          posRefundId,
          completedAt: new Date(),
        })
        .where('idempotencyKey = :key', { key: item.idempotency_key })
        .execute();

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

  // ── 3. Finalize Manifest ──────────────────────────────────────

  async finalizeManifest(
    manifest: SettlementManifest,
  ): Promise<'completed' | 'failed' | 'in_progress'> {
    const data = manifest.manifestData as unknown as SettlementManifestData;
    const items = data.items;

    const acknowledgedCount = items.filter((i) => i.status === 'acknowledged').length;
    const hasMaxRetryFailure = items.some(
      (i) => i.status === 'failed' && i.retry_count >= MAX_RETRIES,
    );

    // Empty manifest (no-bid auction) or all items acknowledged
    if (acknowledgedCount === items.length) {
      return this.completeSettlement(manifest, acknowledgedCount);
    }

    // 3-strike failure escalation
    if (hasMaxRetryFailure) {
      return this.escalateSettlement(manifest, acknowledgedCount);
    }

    // Still in progress — update acknowledged count
    manifest.itemsAcknowledged = acknowledgedCount;
    await this.manifestRepo.save(manifest);
    return 'in_progress';
  }

  private async completeSettlement(
    manifest: SettlementManifest,
    acknowledgedCount: number,
  ): Promise<'completed'> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const auction = await qr.manager
        .createQueryBuilder(Auction, 'a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: manifest.auctionId })
        .getOne();

      if (!auction || auction.status !== AuctionStatus.SETTLING) {
        await qr.rollbackTransaction();
        return 'completed';
      }

      // Transition: SETTLING → SETTLED (DB trigger validates)
      auction.status = AuctionStatus.SETTLED as string;

      // Write settlement summary for audit
      auction.settlementMetadata = {
        manifest_id: manifest.id,
        items_total: manifest.itemsTotal,
        items_acknowledged: acknowledgedCount,
        settled_at: new Date().toISOString(),
      };
      await qr.manager.save(Auction, auction);

      manifest.status = 'completed';
      manifest.itemsAcknowledged = acknowledgedCount;
      manifest.completedAt = new Date();
      await qr.manager.save(SettlementManifest, manifest);

      await qr.commitTransaction();
      this.logger.log(
        JSON.stringify({
          event: 'settlement_completed',
          auction_id: manifest.auctionId,
          manifest_id: manifest.id,
          items_total: manifest.itemsTotal,
          items_acknowledged: acknowledgedCount,
        }),
      );
      return 'completed';
    } catch (err) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async escalateSettlement(
    manifest: SettlementManifest,
    acknowledgedCount: number,
  ): Promise<'failed'> {
    const data = manifest.manifestData as unknown as SettlementManifestData;
    const failedItems = data.items.filter(
      (i) => i.status === 'failed' && i.retry_count >= MAX_RETRIES,
    );

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const auction = await qr.manager
        .createQueryBuilder(Auction, 'a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: manifest.auctionId })
        .getOne();

      if (!auction || auction.status !== AuctionStatus.SETTLING) {
        await qr.rollbackTransaction();
        return 'failed';
      }

      // Transition: SETTLING → SETTLEMENT_FAILED (DB trigger validates)
      auction.status = AuctionStatus.SETTLEMENT_FAILED as string;
      auction.settlementMetadata = {
        manifest_id: manifest.id,
        items_total: manifest.itemsTotal,
        items_acknowledged: acknowledgedCount,
        failed_items: failedItems.map((i) => ({
          deposit_id: i.deposit_id,
          action: i.action,
          failure_reason: i.failure_reason,
          retry_count: i.retry_count,
        })),
        escalated_at: new Date().toISOString(),
      };
      await qr.manager.save(Auction, auction);

      manifest.status = 'escalated';
      manifest.itemsAcknowledged = acknowledgedCount;
      await qr.manager.save(SettlementManifest, manifest);

      await qr.commitTransaction();
      this.logger.error(
        JSON.stringify({
          event: 'settlement_escalated',
          auction_id: manifest.auctionId,
          manifest_id: manifest.id,
          items_total: manifest.itemsTotal,
          items_acknowledged: acknowledgedCount,
          failed_count: failedItems.length,
          failed_deposits: failedItems.map((i) => i.deposit_id),
        }),
      );
      return 'failed';
    } catch (err) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── 4. Update Manifest Data ───────────────────────────────────

  async updateManifestData(
    manifest: SettlementManifest,
    updatedItems: SettlementManifestItem[],
  ): Promise<void> {
    const data = manifest.manifestData as unknown as SettlementManifestData;
    data.items = updatedItems;
    manifest.manifestData = data as unknown as Record<string, unknown>;
    manifest.itemsAcknowledged = updatedItems.filter((i) => i.status === 'acknowledged').length;
    await this.manifestRepo.save(manifest);
  }
}
