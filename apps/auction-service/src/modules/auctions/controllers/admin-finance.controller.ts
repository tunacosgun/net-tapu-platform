import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Auction } from '../entities/auction.entity';
import { Deposit } from '../entities/deposit.entity';
import { PaymentLedger } from '../entities/payment-ledger.entity';
import { SettlementManifest } from '../entities/settlement-manifest.entity';
import { AdminGuard } from '../guards/admin.guard';
import { ListLedgerQueryDto } from '../dto/list-ledger-query.dto';
import { ListDepositsQueryDto } from '../dto/list-deposits-query.dto';
import { MetricsService } from '../../../metrics/metrics.service';
import { AuctionStatus } from '@nettapu/shared';
import { SettlementManifestData } from '../services/settlement.service';

// ── Response types ────────────────────────────────────────────

interface FinancialSummary {
  total_captured_amount: string;
  total_refunded_amount: string;
  total_settled_auctions: number;
  total_failed_settlements: number;
}

interface LedgerEntry {
  id: string;
  payment_id: string | null;
  deposit_id: string | null;
  event: string;
  amount: string;
  currency: string;
  balance_after: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

interface DepositEntry {
  id: string;
  user_id: string;
  auction_id: string;
  amount: string;
  currency: string;
  status: string;
  payment_method: string;
  pos_provider: string | null;
  idempotency_key: string;
  created_at: Date;
  updated_at: Date;
}

interface ReconciliationCheck {
  name: string;
  pass: boolean;
  detail: string;
}

interface ReconciliationResult {
  auction_id: string;
  auction_status: string;
  winner_id: string | null;
  final_price: string | null;
  pass: boolean;
  checks: ReconciliationCheck[];
}

@Controller('admin/finance')
@UseGuards(AdminGuard)
export class AdminFinanceController {
  private readonly logger = new Logger(AdminFinanceController.name);

  constructor(
    @InjectRepository(Auction)
    private readonly auctionRepo: Repository<Auction>,
    @InjectRepository(Deposit)
    private readonly depositRepo: Repository<Deposit>,
    @InjectRepository(PaymentLedger)
    private readonly ledgerRepo: Repository<PaymentLedger>,
    @InjectRepository(SettlementManifest)
    private readonly manifestRepo: Repository<SettlementManifest>,
    private readonly metrics: MetricsService,
  ) {}

  // ── GET /admin/finance/summary ──────────────────────────────────

  @Get('summary')
  async getSummary(): Promise<FinancialSummary> {
    // Sum captured deposits
    const capturedResult = await this.depositRepo
      .createQueryBuilder('d')
      .select('COALESCE(SUM(d.amount::numeric), 0)', 'total')
      .where('d.status = :status', { status: 'captured' })
      .getRawOne();

    // Sum refunded deposits
    const refundedResult = await this.depositRepo
      .createQueryBuilder('d')
      .select('COALESCE(SUM(d.amount::numeric), 0)', 'total')
      .where('d.status = :status', { status: 'refunded' })
      .getRawOne();

    // Count settled auctions
    const settledCount = await this.auctionRepo.count({
      where: { status: AuctionStatus.SETTLED as string },
    });

    // Count failed settlements
    const failedCount = await this.auctionRepo.count({
      where: { status: AuctionStatus.SETTLEMENT_FAILED as string },
    });

    return {
      total_captured_amount: capturedResult?.total ?? '0',
      total_refunded_amount: refundedResult?.total ?? '0',
      total_settled_auctions: settledCount,
      total_failed_settlements: failedCount,
    };
  }

  // ── GET /admin/finance/ledger ───────────────────────────────────

  @Get('ledger')
  async listLedger(
    @Query() query: ListLedgerQueryDto,
  ): Promise<{ data: LedgerEntry[]; meta: { total: number; limit: number; offset: number } }> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const qb = this.ledgerRepo.createQueryBuilder('pl');

    if (query.deposit_id) {
      qb.andWhere('pl.depositId = :depositId', { depositId: query.deposit_id });
    }

    if (query.auction_id) {
      // Join to deposits to filter by auction
      qb.innerJoin(Deposit, 'd', 'd.id = pl.depositId')
        .andWhere('d.auctionId = :auctionId', { auctionId: query.auction_id });
    }

    if (query.user_id) {
      // Need deposits join if not already joined
      if (!query.auction_id) {
        qb.innerJoin(Deposit, 'd', 'd.id = pl.depositId');
      }
      qb.andWhere('d.userId = :userId', { userId: query.user_id });
    }

    if (query.from_date) {
      qb.andWhere('pl.createdAt >= :fromDate', { fromDate: query.from_date });
    }

    if (query.to_date) {
      qb.andWhere('pl.createdAt <= :toDate', { toDate: query.to_date });
    }

    qb.orderBy('pl.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    const [entries, total] = await qb.getManyAndCount();

    return {
      data: entries.map((e) => ({
        id: e.id,
        payment_id: e.paymentId,
        deposit_id: e.depositId,
        event: e.event,
        amount: e.amount,
        currency: e.currency,
        balance_after: e.balanceAfter,
        metadata: e.metadata,
        created_at: e.createdAt,
      })),
      meta: { total, limit, offset },
    };
  }

  // ── GET /admin/finance/deposits ─────────────────────────────────

  @Get('deposits')
  async listDeposits(
    @Query() query: ListDepositsQueryDto,
  ): Promise<{ data: DepositEntry[]; meta: { total: number; limit: number; offset: number } }> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const qb = this.depositRepo.createQueryBuilder('d');

    if (query.status) {
      qb.andWhere('d.status = :status', { status: query.status });
    }

    if (query.auction_id) {
      qb.andWhere('d.auctionId = :auctionId', { auctionId: query.auction_id });
    }

    if (query.user_id) {
      qb.andWhere('d.userId = :userId', { userId: query.user_id });
    }

    qb.orderBy('d.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    const [deposits, total] = await qb.getManyAndCount();

    return {
      data: deposits.map((d) => ({
        id: d.id,
        user_id: d.userId,
        auction_id: d.auctionId,
        amount: d.amount,
        currency: d.currency,
        status: d.status,
        payment_method: d.paymentMethod,
        pos_provider: d.posProvider,
        idempotency_key: d.idempotencyKey,
        created_at: d.createdAt,
        updated_at: d.updatedAt,
      })),
      meta: { total, limit, offset },
    };
  }

  // ── GET /admin/finance/reconciliation/:auctionId ────────────────

  @Get('reconciliation/:auctionId')
  async reconcile(
    @Param('auctionId', ParseUUIDPipe) auctionId: string,
  ): Promise<ReconciliationResult> {
    const auction = await this.auctionRepo.findOne({ where: { id: auctionId } });
    if (!auction) {
      throw new NotFoundException(`Auction ${auctionId} not found`);
    }

    const checks: ReconciliationCheck[] = [];

    // Load all deposits for this auction
    const deposits = await this.depositRepo.find({ where: { auctionId } });

    // Load manifest
    const manifest = await this.manifestRepo.findOne({ where: { auctionId } });

    // Load ledger entries
    const depositIds = deposits.map((d) => d.id);
    let ledgerEntries: PaymentLedger[] = [];
    if (depositIds.length > 0) {
      ledgerEntries = await this.ledgerRepo
        .createQueryBuilder('pl')
        .where('pl.depositId IN (:...ids)', { ids: depositIds })
        .getMany();
    }

    // ── Check 1: Manifest exists ────────────────────────────────
    checks.push({
      name: 'manifest_exists',
      pass: manifest !== null,
      detail: manifest ? `Manifest ${manifest.id} (${manifest.status})` : 'No manifest found',
    });

    // ── Check 2: No deposits stuck in held ──────────────────────
    const heldDeposits = deposits.filter((d) => d.status === 'held');
    checks.push({
      name: 'no_stuck_held_deposits',
      pass: heldDeposits.length === 0,
      detail: heldDeposits.length === 0
        ? 'All deposits have been processed'
        : `${heldDeposits.length} deposits still in 'held' status`,
    });

    // ── Check 3: No deposits stuck in refund_pending ────────────
    const pendingRefunds = deposits.filter((d) => d.status === 'refund_pending');
    checks.push({
      name: 'no_stuck_refund_pending',
      pass: pendingRefunds.length === 0,
      detail: pendingRefunds.length === 0
        ? 'No pending refunds'
        : `${pendingRefunds.length} deposits stuck in 'refund_pending'`,
    });

    // ── Check 4: Winner deposit captured ────────────────────────
    if (auction.winnerId) {
      const winnerDeposit = deposits.find(
        (d) => d.userId === auction.winnerId && d.status === 'captured',
      );
      checks.push({
        name: 'winner_deposit_captured',
        pass: winnerDeposit !== null && winnerDeposit !== undefined,
        detail: winnerDeposit
          ? `Winner deposit ${winnerDeposit.id} captured: ${winnerDeposit.amount} ${winnerDeposit.currency}`
          : `Winner ${auction.winnerId} has no captured deposit`,
      });

      // ── Check 5: Captured amount matches final_price ──────────
      if (winnerDeposit && auction.finalPrice) {
        const capturedAmount = parseFloat(winnerDeposit.amount);
        const finalPrice = parseFloat(auction.finalPrice);
        // Deposit amount >= final_price (deposit is a pre-authorization, not exact match)
        checks.push({
          name: 'captured_amount_sufficient',
          pass: capturedAmount >= finalPrice,
          detail: `Captured=${winnerDeposit.amount}, FinalPrice=${auction.finalPrice}`,
        });
      }
    } else {
      checks.push({
        name: 'no_winner_no_capture',
        pass: deposits.every((d) => d.status !== 'captured'),
        detail: 'No winner — no deposits should be captured',
      });
    }

    // ── Check 6: All losers refunded ────────────────────────────
    const loserDeposits = deposits.filter((d) => d.userId !== auction.winnerId);
    const allLosersRefunded = loserDeposits.every((d) => d.status === 'refunded');
    checks.push({
      name: 'all_losers_refunded',
      pass: loserDeposits.length === 0 || allLosersRefunded,
      detail: allLosersRefunded
        ? `${loserDeposits.length} loser deposits refunded`
        : `${loserDeposits.filter((d) => d.status !== 'refunded').length}/${loserDeposits.length} losers not yet refunded`,
    });

    // ── Check 7: Sum(refunded) = total deposits - captured ──────
    const capturedSum = deposits
      .filter((d) => d.status === 'captured')
      .reduce((sum, d) => sum + parseFloat(d.amount), 0);
    const refundedSum = deposits
      .filter((d) => d.status === 'refunded')
      .reduce((sum, d) => sum + parseFloat(d.amount), 0);
    const totalSum = deposits.reduce((sum, d) => sum + parseFloat(d.amount), 0);

    const expectedRefunded = totalSum - capturedSum;
    // Allow floating point tolerance (0.01)
    const refundBalanceOk = Math.abs(refundedSum - expectedRefunded) < 0.01;
    checks.push({
      name: 'refund_balance',
      pass: refundBalanceOk,
      detail: `Total=${totalSum.toFixed(2)}, Captured=${capturedSum.toFixed(2)}, Refunded=${refundedSum.toFixed(2)}, Expected refund=${expectedRefunded.toFixed(2)}`,
    });

    // ── Check 8: Ledger entry count consistency ─────────────────
    // Each captured deposit should have a DEPOSIT_CAPTURED ledger entry
    // Each refunded deposit should have DEPOSIT_REFUND_INITIATED + DEPOSIT_REFUNDED
    const capturedLedgerCount = ledgerEntries.filter(
      (l) => l.event === 'DEPOSIT_CAPTURED',
    ).length;
    const capturedDepositCount = deposits.filter((d) => d.status === 'captured').length;
    checks.push({
      name: 'captured_ledger_entries',
      pass: capturedLedgerCount === capturedDepositCount,
      detail: `DEPOSIT_CAPTURED entries=${capturedLedgerCount}, captured deposits=${capturedDepositCount}`,
    });

    const refundedLedgerCount = ledgerEntries.filter(
      (l) => l.event === 'DEPOSIT_REFUNDED',
    ).length;
    const refundedDepositCount = deposits.filter((d) => d.status === 'refunded').length;
    checks.push({
      name: 'refunded_ledger_entries',
      pass: refundedLedgerCount === refundedDepositCount,
      detail: `DEPOSIT_REFUNDED entries=${refundedLedgerCount}, refunded deposits=${refundedDepositCount}`,
    });

    // ── Check 9: Manifest items vs deposit states ───────────────
    if (manifest) {
      const manifestData = manifest.manifestData as unknown as SettlementManifestData;
      const items = manifestData.items;
      let itemsMismatched = 0;

      for (const item of items) {
        if (item.status !== 'acknowledged') continue;
        const deposit = deposits.find((d) => d.id === item.deposit_id);
        if (!deposit) { itemsMismatched++; continue; }

        const expectedStatus = item.action === 'capture' ? 'captured' : 'refunded';
        if (deposit.status !== expectedStatus) itemsMismatched++;
      }

      checks.push({
        name: 'manifest_deposit_consistency',
        pass: itemsMismatched === 0,
        detail: itemsMismatched === 0
          ? `All ${items.length} manifest items consistent with deposit states`
          : `${itemsMismatched} manifest items have mismatched deposit states`,
      });
    }

    const allPass = checks.every((c) => c.pass);

    if (!allPass) {
      this.metrics.reconciliationFailuresTotal.inc();
      this.logger.warn(
        `Reconciliation failed for auction ${auctionId}: ` +
        checks.filter((c) => !c.pass).map((c) => c.name).join(', '),
      );
    }

    return {
      auction_id: auctionId,
      auction_status: auction.status,
      winner_id: auction.winnerId,
      final_price: auction.finalPrice,
      pass: allPass,
      checks,
    };
  }
}
