import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SettlementManifest } from '../entities/settlement-manifest.entity';
import { Auction } from '../entities/auction.entity';
import { AdminGuard } from '../guards/admin.guard';
import { ListSettlementsQueryDto } from '../dto/list-settlements-query.dto';
import { MetricsService } from '../../../metrics/metrics.service';
import {
  SettlementManifestData,
  SettlementManifestItem,
  MAX_RETRIES,
} from '../services/settlement.service';
import { AuctionStatus, SettlementManifestStatus } from '@nettapu/shared';

interface ManifestListItem {
  manifest_id: string;
  auction_id: string;
  status: string;
  items_total: number;
  items_acknowledged: number;
  created_at: Date;
  completed_at: Date | null;
  expired_at: Date | null;
}

interface ManifestDetail extends ManifestListItem {
  expires_at: Date;
  manifest_data: SettlementManifestData;
}

interface RetryResponse {
  manifest_id: string;
  auction_id: string;
  status: string;
  items_reset: number;
  retried_at: string;
}

@Controller('admin/settlements')
@UseGuards(AdminGuard)
export class AdminSettlementController {
  private readonly logger = new Logger(AdminSettlementController.name);

  constructor(
    @InjectRepository(SettlementManifest)
    private readonly manifestRepo: Repository<SettlementManifest>,
    @InjectRepository(Auction)
    private readonly auctionRepo: Repository<Auction>,
    private readonly dataSource: DataSource,
    private readonly metrics: MetricsService,
  ) {}

  // ── GET /admin/settlements ──────────────────────────────────────

  @Get()
  async list(
    @Query() query: ListSettlementsQueryDto,
  ): Promise<{ data: ManifestListItem[]; meta: { total: number; limit: number; offset: number } }> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const qb = this.manifestRepo.createQueryBuilder('m');

    if (query.status) {
      qb.where('m.status = :status', { status: query.status });
    }

    if (query.auction_id) {
      qb.andWhere('m.auctionId = :auctionId', { auctionId: query.auction_id });
    }

    qb.orderBy('m.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    const [manifests, total] = await qb.getManyAndCount();

    return {
      data: manifests.map((m) => ({
        manifest_id: m.id,
        auction_id: m.auctionId,
        status: m.status,
        items_total: m.itemsTotal,
        items_acknowledged: m.itemsAcknowledged,
        created_at: m.createdAt,
        completed_at: m.completedAt,
        expired_at: m.expiredAt,
      })),
      meta: { total, limit, offset },
    };
  }

  // ── GET /admin/settlements/:manifestId ──────────────────────────

  @Get(':manifestId')
  async findById(
    @Param('manifestId', ParseUUIDPipe) manifestId: string,
  ): Promise<ManifestDetail> {
    const manifest = await this.manifestRepo.findOne({ where: { id: manifestId } });

    if (!manifest) {
      throw new NotFoundException(`Settlement manifest ${manifestId} not found`);
    }

    return {
      manifest_id: manifest.id,
      auction_id: manifest.auctionId,
      status: manifest.status,
      items_total: manifest.itemsTotal,
      items_acknowledged: manifest.itemsAcknowledged,
      created_at: manifest.createdAt,
      completed_at: manifest.completedAt,
      expired_at: manifest.expiredAt,
      expires_at: manifest.expiresAt,
      manifest_data: manifest.manifestData as unknown as SettlementManifestData,
    };
  }

  // ── POST /admin/settlements/:manifestId/retry ───────────────────

  @Post(':manifestId/retry')
  @HttpCode(HttpStatus.OK)
  async retry(
    @Param('manifestId', ParseUUIDPipe) manifestId: string,
    @Req() req: Record<string, unknown>,
  ): Promise<RetryResponse> {
    const adminUserId =
      (req as Record<string, Record<string, string>>).user?.sub ?? 'unknown';

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Load and validate manifest
      const manifest = await qr.manager.findOne(SettlementManifest, {
        where: { id: manifestId },
      });

      if (!manifest) {
        await qr.rollbackTransaction();
        throw new NotFoundException(`Settlement manifest ${manifestId} not found`);
      }

      if (manifest.status !== SettlementManifestStatus.ESCALATED) {
        await qr.rollbackTransaction();
        throw new BadRequestException(
          `Cannot retry manifest with status '${manifest.status}'. Only 'escalated' manifests can be retried.`,
        );
      }

      // Pessimistic lock on auction
      const auction = await qr.manager
        .createQueryBuilder(Auction, 'a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: manifest.auctionId })
        .getOne();

      if (!auction) {
        await qr.rollbackTransaction();
        throw new NotFoundException(`Auction ${manifest.auctionId} not found`);
      }

      if (auction.status !== AuctionStatus.SETTLEMENT_FAILED) {
        await qr.rollbackTransaction();
        throw new BadRequestException(
          `Cannot retry: auction status is '${auction.status}', expected 'settlement_failed'.`,
        );
      }

      // Reset failed items that haven't exceeded a higher retry budget
      const data = manifest.manifestData as unknown as SettlementManifestData;
      let itemsReset = 0;

      for (const item of data.items) {
        if (item.status === 'failed') {
          item.status = 'pending';
          item.failure_reason = null;
          // Keep retry_count as-is for audit — but allow re-processing by
          // using a higher threshold: items with retry_count >= MAX_RETRIES
          // are exactly the ones that caused escalation, reset them
          if (item.retry_count >= MAX_RETRIES) {
            item.retry_count = 0;
          }
          itemsReset++;
        }
      }

      if (itemsReset === 0) {
        await qr.rollbackTransaction();
        throw new BadRequestException('No failed items to retry');
      }

      // Re-activate manifest
      manifest.manifestData = data as unknown as Record<string, unknown>;
      manifest.status = SettlementManifestStatus.ACTIVE;
      await qr.manager.save(SettlementManifest, manifest);

      // Transition auction: SETTLEMENT_FAILED → SETTLING
      auction.status = AuctionStatus.SETTLING as string;
      auction.settlementMetadata = {
        ...((auction.settlementMetadata as Record<string, unknown>) ?? {}),
        retried_by: adminUserId,
        retried_at: new Date().toISOString(),
        items_reset: itemsReset,
      };
      await qr.manager.save(Auction, auction);

      await qr.commitTransaction();

      this.metrics.adminSettlementRetriesTotal.inc();
      this.metrics.auctionStateTransitionsTotal.inc({
        from: AuctionStatus.SETTLEMENT_FAILED,
        to: AuctionStatus.SETTLING,
      });

      this.logger.log(
        `Admin ${adminUserId} retried settlement for auction ${manifest.auctionId}: ` +
        `${itemsReset} items reset`,
      );

      return {
        manifest_id: manifest.id,
        auction_id: manifest.auctionId,
        status: manifest.status,
        items_reset: itemsReset,
        retried_at: new Date().toISOString(),
      };
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
