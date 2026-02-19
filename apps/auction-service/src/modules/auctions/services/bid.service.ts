import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { Decimal } from 'decimal.js';
import { Auction } from '../entities/auction.entity';
import { Bid } from '../entities/bid.entity';
import { BidRejection } from '../entities/bid-rejection.entity';
import { AuctionParticipant } from '../entities/auction-participant.entity';
import { AuctionConsent } from '../entities/auction-consent.entity';
import { RedisLockService } from './redis-lock.service';
import { PlaceBidDto } from '../dto/place-bid.dto';
import {
  AuctionStatus,
  BidRejectionReason,
} from '@nettapu/shared';

const BID_LOCK_PREFIX = 'bid:lock:auction:';
const BID_LOCK_TTL_MS = 5000;

export interface BidAcceptedResponse {
  bid_id: string;
  auction_id: string;
  amount: string;
  new_price: string;
  new_bid_count: number;
  server_timestamp: string;
  idempotency_key: string;
}

@Injectable()
export class BidService {
  private readonly logger = new Logger(BidService.name);

  constructor(
    @InjectRepository(Auction)
    private readonly auctionRepo: Repository<Auction>,
    @InjectRepository(Bid)
    private readonly bidRepo: Repository<Bid>,
    @InjectRepository(BidRejection)
    private readonly bidRejectionRepo: Repository<BidRejection>,
    @InjectRepository(AuctionParticipant)
    private readonly participantRepo: Repository<AuctionParticipant>,
    @InjectRepository(AuctionConsent)
    private readonly consentRepo: Repository<AuctionConsent>,
    private readonly dataSource: DataSource,
    private readonly redisLock: RedisLockService,
  ) {}

  async placeBid(
    dto: PlaceBidDto,
    userId: string,
    ipAddress?: string,
  ): Promise<BidAcceptedResponse> {
    // ── PHASE 0: Idempotency fast-path (before locking) ────────
    const existing = await this.bidRepo.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      this.logger.debug(`Idempotent hit: ${dto.idempotencyKey}`);
      return this.toResponse(existing);
    }

    // ── PHASE 1: Acquire distributed lock ──────────────────────
    const lockKey = `${BID_LOCK_PREFIX}${dto.auctionId}`;
    const lockValue = await this.redisLock.acquire(lockKey, BID_LOCK_TTL_MS);
    if (!lockValue) {
      throw new HttpException(
        {
          reason_code: 'lock_contention',
          message: 'Auction is processing another bid. Please retry.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    let qr: QueryRunner | null = null;

    try {
      // ── PHASE 2: Start DB transaction ────────────────────────
      qr = this.dataSource.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();

      // ── PHASE 3: Idempotency re-check inside transaction ────
      const existingInTx = await qr.manager.findOne(Bid, {
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existingInTx) {
        await qr.rollbackTransaction();
        return this.toResponse(existingInTx);
      }

      // ── PHASE 4: Load auction ────────────────────────────────
      const auction = await qr.manager.findOne(Auction, {
        where: { id: dto.auctionId },
      });

      if (!auction) {
        await qr.rollbackTransaction();
        this.reject(BidRejectionReason.AUCTION_NOT_LIVE, 'Auction not found');
      }

      // ── PHASE 5: Validate auction status ─────────────────────
      if (auction!.status !== AuctionStatus.LIVE) {
        await this.recordRejection(
          qr, dto, userId,
          BidRejectionReason.AUCTION_NOT_LIVE,
          `Status: ${auction!.status}`,
        );
        await qr.commitTransaction();
        this.reject(
          BidRejectionReason.AUCTION_NOT_LIVE,
          `Auction is not live (status: ${auction!.status})`,
        );
      }

      // ── PHASE 6: Validate participant eligibility ────────────
      const participant = await qr.manager.findOne(AuctionParticipant, {
        where: { auctionId: dto.auctionId, userId },
      });

      if (!participant || !participant.eligible) {
        await this.recordRejection(
          qr, dto, userId,
          BidRejectionReason.USER_NOT_ELIGIBLE,
          'Not eligible participant',
        );
        await qr.commitTransaction();
        this.reject(
          BidRejectionReason.USER_NOT_ELIGIBLE,
          'You are not an eligible participant in this auction',
        );
      }

      // ── PHASE 7: Validate consent ───────────────────────────
      const consent = await qr.manager.findOne(AuctionConsent, {
        where: { auctionId: dto.auctionId, userId },
      });

      if (!consent) {
        await this.recordRejection(
          qr, dto, userId,
          BidRejectionReason.CONSENT_MISSING,
          'No consent record',
        );
        await qr.commitTransaction();
        this.reject(
          BidRejectionReason.CONSENT_MISSING,
          'Auction consent not accepted',
        );
      }

      // ── PHASE 8: Validate reference price ───────────────────
      const currentPrice = auction!.currentPrice ?? auction!.startingPrice;
      if (dto.referencePrice !== currentPrice) {
        await this.recordRejection(
          qr, dto, userId,
          BidRejectionReason.PRICE_CHANGED,
          `Expected ${dto.referencePrice}, actual ${currentPrice}`,
        );
        await qr.commitTransaction();
        this.reject(
          BidRejectionReason.PRICE_CHANGED,
          `Price changed. Current: ${currentPrice}`,
          { current_price: currentPrice },
        );
      }

      // ── PHASE 9: Validate minimum increment ─────────────────
      const bidAmount = new Decimal(dto.amount);
      const basePrice = new Decimal(currentPrice);
      const minIncrement = new Decimal(auction!.minimumIncrement);
      const minimumBid = basePrice.plus(minIncrement);

      if (bidAmount.lessThan(minimumBid)) {
        await this.recordRejection(
          qr, dto, userId,
          BidRejectionReason.BELOW_MINIMUM_INCREMENT,
          `Minimum: ${minimumBid.toString()}, attempted: ${dto.amount}`,
        );
        await qr.commitTransaction();
        this.reject(
          BidRejectionReason.BELOW_MINIMUM_INCREMENT,
          `Minimum bid is ${minimumBid.toString()}`,
        );
      }

      // ── PHASE 10: Check duplicate amount ─────────────────────
      const dupBid = await qr.manager.findOne(Bid, {
        where: { auctionId: dto.auctionId, amount: dto.amount },
      });

      if (dupBid) {
        await this.recordRejection(
          qr, dto, userId,
          BidRejectionReason.AMOUNT_ALREADY_BID,
          `Amount ${dto.amount} already bid`,
        );
        await qr.commitTransaction();
        this.reject(
          BidRejectionReason.AMOUNT_ALREADY_BID,
          `Amount ${dto.amount} already bid`,
        );
      }

      // ── PHASE 11: INSERT bid (append-only) ───────────────────
      const newBid = qr.manager.create(Bid, {
        auctionId: dto.auctionId,
        userId,
        amount: dto.amount,
        referencePrice: dto.referencePrice,
        idempotencyKey: dto.idempotencyKey,
        serverTs: new Date(),
        clientSentAt: dto.clientSentAt ? new Date(dto.clientSentAt) : null,
        ipAddress: ipAddress ?? null,
      });
      const savedBid = await qr.manager.save(Bid, newBid);

      // ── PHASE 12: UPDATE auction (optimistic lock) ───────────
      auction!.currentPrice = dto.amount;
      auction!.bidCount = auction!.bidCount + 1;
      // @VersionColumn auto-increments + checks WHERE version = :current
      try {
        await qr.manager.save(Auction, auction!);
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.name === 'OptimisticLockVersionMismatchError'
        ) {
          await qr.rollbackTransaction();
          this.logger.warn(
            `Optimistic lock conflict: auction=${dto.auctionId}`,
          );
          this.reject(
            BidRejectionReason.PRICE_CHANGED,
            'Concurrent bid detected. Please retry.',
          );
        }
        throw err;
      }

      // ── PHASE 13: COMMIT ─────────────────────────────────────
      await qr.commitTransaction();

      this.logger.log(
        `BID ACCEPTED auction=${dto.auctionId} user=${userId} amount=${dto.amount} bid=${savedBid.id} ip=${ipAddress ?? 'unknown'}`,
      );

      return {
        bid_id: savedBid.id,
        auction_id: savedBid.auctionId,
        amount: savedBid.amount,
        new_price: dto.amount,
        new_bid_count: auction!.bidCount,
        server_timestamp: savedBid.serverTs.toISOString(),
        idempotency_key: savedBid.idempotencyKey,
      };
    } catch (err) {
      if (qr?.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw err;
    } finally {
      // ── PHASE 14: Release lock + cleanup ─────────────────────
      await this.redisLock.release(lockKey, lockValue);
      if (qr) {
        await qr.release();
      }
    }
  }

  // ── Private helpers ────────────────────────────────────────────

  private reject(
    reason: BidRejectionReason,
    message: string,
    extra?: Record<string, unknown>,
  ): never {
    const statusMap: Partial<Record<BidRejectionReason, HttpStatus>> = {
      [BidRejectionReason.AUCTION_NOT_LIVE]: HttpStatus.CONFLICT,
      [BidRejectionReason.PRICE_CHANGED]: HttpStatus.CONFLICT,
      [BidRejectionReason.AMOUNT_ALREADY_BID]: HttpStatus.CONFLICT,
      [BidRejectionReason.BELOW_MINIMUM_INCREMENT]:
        HttpStatus.UNPROCESSABLE_ENTITY,
      [BidRejectionReason.INSUFFICIENT_DEPOSIT]: HttpStatus.PAYMENT_REQUIRED,
      [BidRejectionReason.USER_NOT_ELIGIBLE]: HttpStatus.FORBIDDEN,
      [BidRejectionReason.CONSENT_MISSING]: HttpStatus.FORBIDDEN,
      [BidRejectionReason.RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
    };

    throw new HttpException(
      { reason_code: reason, message, ...extra },
      statusMap[reason] ?? HttpStatus.BAD_REQUEST,
    );
  }

  private async recordRejection(
    qr: QueryRunner,
    dto: PlaceBidDto,
    userId: string,
    reason: BidRejectionReason,
    details: string,
  ): Promise<void> {
    const rejection = qr.manager.create(BidRejection, {
      auctionId: dto.auctionId,
      userId,
      attemptedAmount: dto.amount,
      reason,
      details,
      serverTs: new Date(),
    });
    await qr.manager.save(BidRejection, rejection);
  }

  private toResponse(bid: Bid): BidAcceptedResponse {
    return {
      bid_id: bid.id,
      auction_id: bid.auctionId,
      amount: bid.amount,
      new_price: bid.amount,
      new_bid_count: -1,
      server_timestamp: bid.serverTs.toISOString(),
      idempotency_key: bid.idempotencyKey,
    };
  }
}
