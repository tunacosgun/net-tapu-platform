import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Auction } from '../entities/auction.entity';
import { Bid } from '../entities/bid.entity';
import { RedisLockService } from '../services/redis-lock.service';
import { AuctionGateway } from '../gateways/auction.gateway';
import { MetricsService } from '../../../metrics/metrics.service';
import { AuctionStatus } from '@nettapu/shared';

const WORKER_LOCK_PREFIX = 'auction:ending:lock:';
const WORKER_LOCK_TTL_MS = 10_000;
const POLL_INTERVAL_MS = 1_000;

@Injectable()
export class AuctionEndingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuctionEndingWorker.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    @InjectRepository(Auction)
    private readonly auctionRepo: Repository<Auction>,
    @InjectRepository(Bid)
    private readonly bidRepo: Repository<Bid>,
    private readonly dataSource: DataSource,
    private readonly redisLock: RedisLockService,
    private readonly gateway: AuctionGateway,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      this.tick().catch((err) => {
        this.logger.error(`Worker tick error: ${err.message}`, err.stack);
      });
    }, POLL_INTERVAL_MS);
    this.logger.log('AuctionEndingWorker started (1s poll)');
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.logger.log('AuctionEndingWorker stopped');
  }

  private async tick(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      // Find auctions past their effective end time
      const expiredAuctions = await this.auctionRepo
        .createQueryBuilder('a')
        .where('a.status IN (:...statuses)', {
          statuses: [AuctionStatus.LIVE, AuctionStatus.ENDING],
        })
        .andWhere('NOW() >= COALESCE(a.extendedUntil, a.scheduledEnd)')
        .getMany();

      for (const auction of expiredAuctions) {
        await this.processAuction(auction);
      }
    } catch (err) {
      this.logger.error(
        `Worker tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      this.processing = false;
    }
  }

  private async processAuction(auction: Auction): Promise<void> {
    const lockKey = `${WORKER_LOCK_PREFIX}${auction.id}`;
    const lockValue = await this.redisLock.acquire(lockKey, WORKER_LOCK_TTL_MS);

    if (!lockValue) {
      // Another instance is processing this auction
      return;
    }

    try {
      if (auction.status === AuctionStatus.LIVE) {
        await this.transitionLiveToEnding(auction);
        // Immediately attempt ENDING → ENDED (same tick)
        await this.transitionEndingToEnded(auction);
      } else if (auction.status === AuctionStatus.ENDING) {
        await this.transitionEndingToEnded(auction);
      }
    } catch (err) {
      this.logger.error(
        `Failed to process auction ${auction.id}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      await this.redisLock.release(lockKey, lockValue);
    }
  }

  /**
   * LIVE → ENDING
   * Stops new bids (BidService Phase 5 checks status === LIVE).
   */
  private async transitionLiveToEnding(auction: Auction): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Pessimistic lock: SELECT ... FOR UPDATE
      const locked = await qr.manager
        .createQueryBuilder(Auction, 'a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: auction.id })
        .getOne();

      if (!locked || locked.status !== AuctionStatus.LIVE) {
        await qr.rollbackTransaction();
        return;
      }

      // Re-check: is the auction actually past its effective end?
      const effectiveEnd = locked.extendedUntil ?? locked.scheduledEnd;
      if (!effectiveEnd || new Date(effectiveEnd).getTime() > Date.now()) {
        // Not yet expired (extended by a bid between query and lock)
        await qr.rollbackTransaction();
        return;
      }

      locked.status = AuctionStatus.ENDING as string;
      await qr.manager.save(Auction, locked);
      await qr.commitTransaction();

      this.logger.log(`Auction ${auction.id}: LIVE → ENDING`);
      this.metrics.auctionStateTransitionsTotal.inc({
        from: AuctionStatus.LIVE,
        to: AuctionStatus.ENDING,
      });

      // Broadcast to WebSocket clients
      this.gateway.broadcastAuctionEnding(auction.id, {
        type: 'AUCTION_ENDING',
        time_remaining_ms: 0,
      });
    } catch (err) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw err;
    } finally {
      await qr.release();
    }
  }

  /**
   * ENDING → ENDED
   * Determines winner, freezes outcome fields, broadcasts result.
   */
  private async transitionEndingToEnded(auction: Auction): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Pessimistic lock
      const locked = await qr.manager
        .createQueryBuilder(Auction, 'a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: auction.id })
        .getOne();

      if (!locked || locked.status !== (AuctionStatus.ENDING as string)) {
        await qr.rollbackTransaction();
        return;
      }

      // Determine winner: highest bid amount, tie-break earliest server_ts
      const winningBid = await qr.manager
        .createQueryBuilder(Bid, 'b')
        .where('b.auctionId = :auctionId', { auctionId: locked.id })
        .orderBy('b.amount::numeric', 'DESC')
        .addOrderBy('b.serverTs', 'ASC')
        .getOne();

      locked.status = AuctionStatus.ENDED as string;
      locked.endedAt = new Date();

      if (winningBid) {
        locked.finalPrice = winningBid.amount;
        locked.winnerId = winningBid.userId;
        locked.winnerBidId = winningBid.id;
      }

      await qr.manager.save(Auction, locked);
      await qr.commitTransaction();

      this.logger.log(
        `Auction ${auction.id}: ENDING → ENDED winner=${locked.winnerId ?? 'none'} finalPrice=${locked.finalPrice ?? 'none'}`,
      );
      this.metrics.auctionEndingsTotal.inc();
      this.metrics.auctionStateTransitionsTotal.inc({
        from: AuctionStatus.ENDING,
        to: AuctionStatus.ENDED,
      });

      // Broadcast AUCTION_ENDED to all connected clients
      this.gateway.broadcastAuctionEnded(auction.id, {
        type: 'AUCTION_ENDED',
        winner_id_masked: locked.winnerId
          ? locked.winnerId.slice(0, 8) + '***'
          : 'none',
        final_price: locked.finalPrice ?? '0',
      });
    } catch (err) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw err;
    } finally {
      await qr.release();
    }
  }
}
