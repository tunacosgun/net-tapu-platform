import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Auction } from '../entities/auction.entity';
import { SettlementManifest } from '../entities/settlement-manifest.entity';
import {
  SettlementService,
  SettlementManifestData,
  MAX_RETRIES,
  ITEMS_PER_TICK,
} from '../services/settlement.service';
import { RedisLockService } from '../services/redis-lock.service';
import { AuctionGateway } from '../gateways/auction.gateway';
import { MetricsService } from '../../../metrics/metrics.service';
import { AuctionStatus, SettlementManifestStatus } from '@nettapu/shared';

const WORKER_LOCK_PREFIX = 'auction:settlement:lock:';
const WORKER_LOCK_TTL_MS = 30_000; // 30s — longer TTL for POS calls
const POLL_INTERVAL_MS = 5_000;
const MAX_MANIFESTS_PER_TICK = 3;
const MEMORY_SAFETY_ITEMS_LIMIT = 500;

@Injectable()
export class SettlementWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettlementWorker.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    @InjectRepository(Auction)
    private readonly auctionRepo: Repository<Auction>,
    @InjectRepository(SettlementManifest)
    private readonly manifestRepo: Repository<SettlementManifest>,
    private readonly settlementService: SettlementService,
    private readonly redisLock: RedisLockService,
    private readonly gateway: AuctionGateway,
    private readonly metrics: MetricsService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      this.tick().catch((err) => {
        this.logger.error(
          JSON.stringify({
            event: 'settlement_worker_tick_error',
            error: (err as Error).message,
            stack: (err as Error).stack,
          }),
        );
      });
    }, POLL_INTERVAL_MS);
    this.logger.log(
      JSON.stringify({
        event: 'settlement_worker_started',
        poll_interval_ms: POLL_INTERVAL_MS,
        max_manifests_per_tick: MAX_MANIFESTS_PER_TICK,
        max_items_per_tick: ITEMS_PER_TICK,
      }),
    );
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.logger.log(JSON.stringify({ event: 'settlement_worker_stopped' }));
  }

  private async tick(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    const tickStart = Date.now();

    try {
      // Guard: skip tick if Redis is unhealthy (we need locks for safety)
      if (!this.redisLock.isHealthy()) {
        this.logger.warn(
          JSON.stringify({
            event: 'settlement_worker_skip',
            reason: 'redis_unhealthy',
          }),
        );
        return;
      }

      // Query 1: Find ENDED auctions needing settlement initiation
      await this.initiateNewSettlements();

      // Query 2: Find ACTIVE manifests needing processing
      await this.processActiveManifests();
    } catch (err) {
      this.logger.error(
        JSON.stringify({
          event: 'settlement_worker_tick_failed',
          error: (err as Error).message,
          stack: (err as Error).stack,
        }),
      );
    } finally {
      const durationMs = Date.now() - tickStart;
      this.metrics.settlementWorkerDurationMs.observe(durationMs);
      this.processing = false;
    }
  }

  private async initiateNewSettlements(): Promise<void> {
    const endedAuctions = await this.auctionRepo
      .createQueryBuilder('a')
      .where('a.status = :status', { status: AuctionStatus.ENDED })
      .getMany();

    for (const auction of endedAuctions) {
      const lockKey = `${WORKER_LOCK_PREFIX}${auction.id}`;
      let lockValue: string | null;

      try {
        lockValue = await this.redisLock.acquire(lockKey, WORKER_LOCK_TTL_MS);
      } catch {
        this.metrics.settlementLockFailuresTotal.inc();
        this.logger.error(
          JSON.stringify({
            event: 'settlement_lock_failure',
            auction_id: auction.id,
            phase: 'initiation',
          }),
        );
        continue;
      }

      if (!lockValue) {
        this.metrics.settlementLockFailuresTotal.inc();
        continue;
      }

      try {
        const manifest = await this.settlementService.initiateSettlement(auction.id);

        if (manifest) {
          this.metrics.settlementInitiatedTotal.inc();
          this.metrics.auctionStateTransitionsTotal.inc({
            from: AuctionStatus.ENDED,
            to: AuctionStatus.SETTLING,
          });

          this.gateway.broadcastSettlementPending(auction.id, {
            type: 'AUCTION_SETTLEMENT_PENDING',
            auction_id: auction.id,
            manifest_id: manifest.id,
            items_total: manifest.itemsTotal,
          });

          // If manifest is empty (no-bid auction), immediately finalize
          if (manifest.itemsTotal === 0) {
            const result = await this.settlementService.finalizeManifest(manifest);
            if (result === 'completed') {
              this.metrics.settlementCompletedTotal.inc();
              this.metrics.auctionStateTransitionsTotal.inc({
                from: AuctionStatus.SETTLING,
                to: AuctionStatus.SETTLED,
              });
              this.gateway.broadcastSettlementCompleted(auction.id, {
                type: 'AUCTION_SETTLED',
                auction_id: auction.id,
              });
            }
          }
        }
      } catch (err) {
        this.logger.error(
          JSON.stringify({
            event: 'settlement_initiation_failed',
            auction_id: auction.id,
            error: (err as Error).message,
            stack: (err as Error).stack,
          }),
        );
      } finally {
        await this.redisLock.release(lockKey, lockValue);
      }
    }
  }

  private async processActiveManifests(): Promise<void> {
    const activeManifests = await this.manifestRepo.find({
      where: { status: SettlementManifestStatus.ACTIVE },
    });

    // Report backlog
    this.metrics.settlementBacklogGauge.set(activeManifests.length);

    if (activeManifests.length > MAX_MANIFESTS_PER_TICK) {
      this.logger.warn(
        JSON.stringify({
          event: 'settlement_backlog_detected',
          total_active: activeManifests.length,
          processing_limit: MAX_MANIFESTS_PER_TICK,
        }),
      );
    }

    let manifestsProcessed = 0;

    for (const manifest of activeManifests) {
      if (manifestsProcessed >= MAX_MANIFESTS_PER_TICK) break;

      const lockKey = `${WORKER_LOCK_PREFIX}${manifest.auctionId}`;
      let lockValue: string | null;

      try {
        lockValue = await this.redisLock.acquire(lockKey, WORKER_LOCK_TTL_MS);
      } catch {
        this.metrics.settlementLockFailuresTotal.inc();
        this.logger.error(
          JSON.stringify({
            event: 'settlement_lock_failure',
            auction_id: manifest.auctionId,
            manifest_id: manifest.id,
            phase: 'processing',
          }),
        );
        continue;
      }

      if (!lockValue) {
        this.metrics.settlementLockFailuresTotal.inc();
        continue;
      }

      try {
        // Check for manifest expiry (48h)
        if (new Date() > manifest.expiresAt) {
          await this.handleManifestExpiry(manifest);
          manifestsProcessed++;
          continue;
        }

        const data = manifest.manifestData as unknown as SettlementManifestData;
        const items = data.items;

        // Memory safety guard: oversized manifests get escalated immediately
        if (items.length > MEMORY_SAFETY_ITEMS_LIMIT) {
          this.logger.error(
            JSON.stringify({
              event: 'settlement_memory_safety_escalation',
              auction_id: manifest.auctionId,
              manifest_id: manifest.id,
              items_count: items.length,
              limit: MEMORY_SAFETY_ITEMS_LIMIT,
            }),
          );
          await this.escalateOversizedManifest(manifest);
          manifestsProcessed++;
          continue;
        }

        let itemsProcessedThisTick = 0;

        // Process pending and failed (retryable) items — BOUNDED per tick
        for (let i = 0; i < items.length; i++) {
          if (itemsProcessedThisTick >= ITEMS_PER_TICK) break;

          const item = items[i];
          if (item.status === 'pending' || (item.status === 'failed' && item.retry_count < MAX_RETRIES)) {
            const startMs = Date.now();
            items[i] = await this.settlementService.processManifestItem(manifest, item);
            const itemDurationMs = Date.now() - startMs;
            itemsProcessedThisTick++;

            this.logger.log(
              JSON.stringify({
                event: 'settlement_item_processed',
                auction_id: manifest.auctionId,
                item_id: items[i].item_id,
                action: items[i].action,
                status: items[i].status,
                duration_ms: itemDurationMs,
              }),
            );

            if (items[i].status === 'acknowledged') {
              if (items[i].action === 'capture') {
                this.metrics.settlementCapturesTotal.inc();
              } else {
                this.metrics.settlementRefundsTotal.inc();
              }
            }

            // Persist after each item for crash safety —
            // if worker crashes mid-batch, already-processed items are saved
            await this.settlementService.updateManifestData(manifest, items);
          }
        }

        // Broadcast progress if any work was done
        if (itemsProcessedThisTick > 0) {
          const acknowledgedCount = items.filter((i) => i.status === 'acknowledged').length;
          this.gateway.broadcastSettlementProgress(manifest.auctionId, {
            type: 'AUCTION_SETTLEMENT_PROGRESS',
            auction_id: manifest.auctionId,
            items_total: manifest.itemsTotal,
            items_acknowledged: acknowledgedCount,
          });
        }

        // Attempt finalization
        const result = await this.settlementService.finalizeManifest(manifest);

        if (result === 'completed') {
          this.metrics.settlementCompletedTotal.inc();
          this.metrics.auctionStateTransitionsTotal.inc({
            from: AuctionStatus.SETTLING,
            to: AuctionStatus.SETTLED,
          });
          this.gateway.broadcastSettlementCompleted(manifest.auctionId, {
            type: 'AUCTION_SETTLED',
            auction_id: manifest.auctionId,
          });
        } else if (result === 'failed') {
          this.metrics.settlementFailedTotal.inc();
          this.metrics.auctionStateTransitionsTotal.inc({
            from: AuctionStatus.SETTLING,
            to: AuctionStatus.SETTLEMENT_FAILED,
          });
          this.gateway.broadcastSettlementFailed(manifest.auctionId, {
            type: 'AUCTION_SETTLEMENT_FAILED',
            auction_id: manifest.auctionId,
          });
        }

        manifestsProcessed++;
      } catch (err) {
        this.logger.error(
          JSON.stringify({
            event: 'settlement_manifest_processing_failed',
            auction_id: manifest.auctionId,
            manifest_id: manifest.id,
            error: (err as Error).message,
            stack: (err as Error).stack,
          }),
        );
      } finally {
        await this.redisLock.release(lockKey, lockValue);
      }
    }
  }

  private async handleManifestExpiry(manifest: SettlementManifest): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const auction = await qr.manager
        .createQueryBuilder(Auction, 'a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: manifest.auctionId })
        .getOne();

      if (auction && auction.status === AuctionStatus.SETTLING) {
        auction.status = AuctionStatus.SETTLEMENT_FAILED as string;
        auction.settlementMetadata = {
          manifest_id: manifest.id,
          items_total: manifest.itemsTotal,
          items_acknowledged: manifest.itemsAcknowledged,
          expired_at: new Date().toISOString(),
          reason: 'Manifest 48h expiry',
        };
        await qr.manager.save(Auction, auction);
      }

      manifest.status = 'expired';
      manifest.expiredAt = new Date();
      await qr.manager.save(SettlementManifest, manifest);

      await qr.commitTransaction();
    } catch (err) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw err;
    } finally {
      await qr.release();
    }

    this.metrics.settlementExpiredTotal.inc();
    this.metrics.auctionStateTransitionsTotal.inc({
      from: AuctionStatus.SETTLING,
      to: AuctionStatus.SETTLEMENT_FAILED,
    });
    this.logger.warn(
      JSON.stringify({
        event: 'settlement_expired',
        auction_id: manifest.auctionId,
        manifest_id: manifest.id,
        items_total: manifest.itemsTotal,
        items_acknowledged: manifest.itemsAcknowledged,
      }),
    );

    this.gateway.broadcastSettlementFailed(manifest.auctionId, {
      type: 'AUCTION_SETTLEMENT_FAILED',
      auction_id: manifest.auctionId,
    });
  }

  private async escalateOversizedManifest(manifest: SettlementManifest): Promise<void> {
    const data = manifest.manifestData as unknown as SettlementManifestData;
    const acknowledgedCount = data.items.filter((i) => i.status === 'acknowledged').length;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const auction = await qr.manager
        .createQueryBuilder(Auction, 'a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: manifest.auctionId })
        .getOne();

      if (auction && auction.status === AuctionStatus.SETTLING) {
        auction.status = AuctionStatus.SETTLEMENT_FAILED as string;
        auction.settlementMetadata = {
          manifest_id: manifest.id,
          items_total: manifest.itemsTotal,
          items_acknowledged: acknowledgedCount,
          escalated_at: new Date().toISOString(),
          reason: `Memory safety: ${data.items.length} items exceeds limit of ${MEMORY_SAFETY_ITEMS_LIMIT}`,
        };
        await qr.manager.save(Auction, auction);
      }

      manifest.status = 'escalated';
      manifest.itemsAcknowledged = acknowledgedCount;
      await qr.manager.save(SettlementManifest, manifest);

      await qr.commitTransaction();
    } catch (err) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw err;
    } finally {
      await qr.release();
    }

    this.metrics.settlementFailedTotal.inc();
    this.metrics.auctionStateTransitionsTotal.inc({
      from: AuctionStatus.SETTLING,
      to: AuctionStatus.SETTLEMENT_FAILED,
    });

    this.gateway.broadcastSettlementFailed(manifest.auctionId, {
      type: 'AUCTION_SETTLEMENT_FAILED',
      auction_id: manifest.auctionId,
    });
  }
}
