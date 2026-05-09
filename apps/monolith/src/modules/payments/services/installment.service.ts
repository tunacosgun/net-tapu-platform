import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThanOrEqual } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  IPosGateway,
  POS_GATEWAY,
  PaymentLedger,
  LedgerEvent,
} from '@nettapu/shared';
import { Payment } from '../entities/payment.entity';
import { InstallmentPlan } from '../entities/installment-plan.entity';
import { Installment, InstallmentStatus } from '../entities/installment.entity';
import { CreateInstallmentPlanDto } from '../dto/create-installment-plan.dto';

const MAX_RETRY_COUNT = 3;

interface ScheduledItem {
  sequenceNo: number;
  amount: string;
  dueDate: string;
}

export interface ChargeResult {
  success: boolean;
  message: string;
  paymentId?: string;
}

@Injectable()
export class InstallmentService {
  private readonly logger = new Logger(InstallmentService.name);

  constructor(
    @InjectRepository(InstallmentPlan)
    private readonly planRepo: Repository<InstallmentPlan>,
    @InjectRepository(Installment)
    private readonly installmentRepo: Repository<Installment>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @Inject(POS_GATEWAY)
    private readonly posGateway: IPosGateway,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  // ── Plan creation ─────────────────────────────────────────

  /**
   * Create a new installment plan + N installment rows.
   * Total amount is split equally; last installment absorbs rounding.
   */
  async createPlan(dto: CreateInstallmentPlanDto): Promise<InstallmentPlan> {
    const schedule = this.calculateSchedule(
      dto.totalAmount,
      dto.installmentCount,
      dto.firstDueDate,
    );

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const plan = qr.manager.create(InstallmentPlan, {
        userId: dto.userId,
        parcelId: dto.parcelId,
        auctionId: dto.auctionId ?? null,
        totalAmount: dto.totalAmount,
        installmentCount: dto.installmentCount,
        paidCount: 0,
        currency: dto.currency ?? 'TRY',
        status: 'active',
        autoCharge: dto.autoCharge ?? true,
        cardToken: dto.cardToken ?? null,
        firstDueDate: dto.firstDueDate,
        notes: dto.notes ?? null,
        planDetails: {
          schedule: schedule.map((s) => ({
            sequenceNo: s.sequenceNo,
            amount: s.amount,
            dueDate: s.dueDate,
          })),
          createdBy: 'admin',
        },
      });
      const savedPlan = await qr.manager.save(InstallmentPlan, plan);

      const rows = schedule.map((s) =>
        qr.manager.create(Installment, {
          planId: savedPlan.id,
          sequenceNo: s.sequenceNo,
          amount: s.amount,
          currency: dto.currency ?? 'TRY',
          dueDate: s.dueDate,
          status: 'pending' as InstallmentStatus,
          retryCount: 0,
        }),
      );
      await qr.manager.save(Installment, rows);

      await qr.commitTransaction();

      this.logger.log(
        JSON.stringify({
          event: 'installment_plan_created',
          plan_id: savedPlan.id,
          user_id: dto.userId,
          installments: dto.installmentCount,
          total: dto.totalAmount,
        }),
      );

      return savedPlan;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /**
   * Equal-split schedule with monthly due dates.
   * Last installment absorbs rounding to keep sum exact.
   */
  calculateSchedule(
    totalAmount: string,
    count: number,
    firstDueDate: string,
  ): ScheduledItem[] {
    const totalCents = Math.round(parseFloat(totalAmount) * 100);
    const baseCents = Math.floor(totalCents / count);
    const remainder = totalCents - baseCents * count;

    const items: ScheduledItem[] = [];
    const start = new Date(`${firstDueDate}T00:00:00Z`);

    for (let i = 0; i < count; i++) {
      const cents = i === count - 1 ? baseCents + remainder : baseCents;
      const due = new Date(start);
      due.setUTCMonth(due.getUTCMonth() + i);

      items.push({
        sequenceNo: i + 1,
        amount: (cents / 100).toFixed(2),
        dueDate: due.toISOString().slice(0, 10),
      });
    }
    return items;
  }

  // ── Charge a single installment ───────────────────────────

  /**
   * Attempt to charge one installment via POS gateway.
   * Idempotent on (installmentId, retryCount).
   */
  async processInstallment(installmentId: string): Promise<ChargeResult> {
    const inst = await this.installmentRepo.findOne({ where: { id: installmentId } });
    if (!inst) throw new NotFoundException('Installment not found');
    if (inst.status === 'paid') {
      return { success: true, message: 'Already paid' };
    }
    if (inst.status === 'cancelled') {
      return { success: false, message: 'Installment cancelled' };
    }

    const plan = await this.planRepo.findOne({ where: { id: inst.planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.status !== 'active') {
      return { success: false, message: `Plan status: ${plan.status}` };
    }
    if (!plan.autoCharge && !this.isManualTrigger()) {
      return { success: false, message: 'Plan requires manual payment' };
    }

    const idempotencyKey = `installment:${inst.id}:${inst.retryCount}`;

    // 1. Create Payment row in pending state
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let paymentId: string;
    try {
      const payment = qr.manager.create(Payment, {
        userId: plan.userId,
        parcelId: plan.parcelId,
        auctionId: plan.auctionId,
        amount: inst.amount,
        currency: inst.currency,
        status: 'pending',
        paymentMethod: 'credit_card',
        description: `Taksit ${inst.sequenceNo}/${plan.installmentCount} - ${plan.id}`,
        idempotencyKey,
      });
      const saved = await qr.manager.save(Payment, payment);
      paymentId = saved.id;

      // Mark installment as in-progress
      await qr.manager.update(
        Installment,
        { id: inst.id },
        {
          paymentId,
          lastAttemptAt: new Date(),
          retryCount: inst.retryCount + 1,
        },
      );
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      await qr.release();
      throw err;
    } finally {
      if (!qr.isReleased) await qr.release();
    }

    // 2. Call POS — non-3DS auto-charge using stored cardToken
    try {
      const provision = await this.posGateway.initiateProvision({
        paymentId,
        amount: inst.amount,
        currency: inst.currency,
        idempotencyKey,
        cardToken: plan.cardToken ?? undefined,
      });

      if (provision.status === 'completed') {
        await this.markPaid(inst.id, paymentId);
        await this.bumpPaidCount(plan.id);
        await this.writeLedger(paymentId, LedgerEvent.PAYMENT_CAPTURED, inst.amount, inst.currency);
        this.logger.log(
          JSON.stringify({
            event: 'installment_paid',
            installment_id: inst.id,
            plan_id: plan.id,
            payment_id: paymentId,
            sequence: inst.sequenceNo,
          }),
        );
        return { success: true, message: 'Charged', paymentId };
      }

      // requires_3ds or failed → mark failed, schedule retry or escalate
      return await this.handleFailedCharge(inst.id, paymentId, provision.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return await this.handleFailedCharge(inst.id, paymentId, msg);
    }
  }

  async handleFailedCharge(
    installmentId: string,
    paymentId: string,
    errorMessage: string,
  ): Promise<ChargeResult> {
    const inst = await this.installmentRepo.findOne({ where: { id: installmentId } });
    if (!inst) throw new NotFoundException('Installment not found');

    const newStatus: InstallmentStatus =
      inst.retryCount >= MAX_RETRY_COUNT ? 'overdue' : 'failed';

    await this.installmentRepo.update(
      { id: installmentId },
      { status: newStatus, lastError: errorMessage.slice(0, 1000) },
    );

    // Mark linked payment as failed
    if (paymentId) {
      await this.paymentRepo.update({ id: paymentId }, { status: 'failed' });
    }

    this.logger.warn(
      JSON.stringify({
        event: 'installment_charge_failed',
        installment_id: installmentId,
        retry_count: inst.retryCount,
        new_status: newStatus,
        error: errorMessage,
      }),
    );

    return { success: false, message: errorMessage };
  }

  // ── Listing / queries ─────────────────────────────────────

  async getPlanWithInstallments(
    planId: string,
  ): Promise<{ plan: InstallmentPlan; installments: Installment[] }> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    const installments = await this.installmentRepo.find({
      where: { planId },
      order: { sequenceNo: 'ASC' },
    });
    return { plan, installments };
  }

  async listPlansForUser(userId: string): Promise<InstallmentPlan[]> {
    return this.planRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async listAllPlans(filters: {
    status?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: InstallmentPlan[]; total: number }> {
    const qb = this.planRepo.createQueryBuilder('p').orderBy('p.created_at', 'DESC');
    if (filters.status) qb.andWhere('p.status = :s', { s: filters.status });
    if (filters.userId) qb.andWhere('p.user_id = :u', { u: filters.userId });
    const limit = Math.min(filters.limit ?? 50, 200);
    qb.take(limit).skip(((filters.page ?? 1) - 1) * limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findDueInstallments(asOf: Date = new Date()): Promise<Installment[]> {
    const dateStr = asOf.toISOString().slice(0, 10);
    return this.installmentRepo.find({
      where: { status: 'pending', dueDate: LessThanOrEqual(dateStr) },
      order: { dueDate: 'ASC' },
      take: 100,
    });
  }

  /** User-initiated manual payment for a single installment */
  async payManually(installmentId: string, userId: string): Promise<ChargeResult> {
    const inst = await this.installmentRepo.findOne({ where: { id: installmentId } });
    if (!inst) throw new NotFoundException('Installment not found');
    const plan = await this.planRepo.findOne({ where: { id: inst.planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.userId !== userId) throw new ForbiddenException('Not your installment');
    if (inst.status === 'paid') throw new BadRequestException('Already paid');
    return this.processInstallment(installmentId);
  }

  /** Cancel an entire plan (admin action) — refunds NOT triggered automatically */
  async cancelPlan(planId: string, reason: string): Promise<InstallmentPlan> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.status !== 'active') {
      throw new BadRequestException(`Cannot cancel plan in status ${plan.status}`);
    }

    plan.status = 'cancelled';
    plan.notes = `${plan.notes ?? ''}\n[CANCELLED] ${reason}`;
    await this.planRepo.save(plan);

    await this.installmentRepo.update(
      { planId, status: 'pending' },
      { status: 'cancelled', lastError: `Plan cancelled: ${reason}` },
    );

    this.logger.log(
      JSON.stringify({
        event: 'installment_plan_cancelled',
        plan_id: planId,
        reason,
      }),
    );

    return plan;
  }

  // ── Helpers ───────────────────────────────────────────────

  private async markPaid(installmentId: string, paymentId: string) {
    await this.installmentRepo.update(
      { id: installmentId },
      {
        status: 'paid',
        paidAt: new Date(),
        paymentId,
        lastError: null,
      },
    );
    await this.paymentRepo.update({ id: paymentId }, { status: 'completed' });
  }

  private async bumpPaidCount(planId: string) {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) return;
    const newPaidCount = plan.paidCount + 1;
    const status =
      newPaidCount >= plan.installmentCount ? 'completed' : plan.status;
    await this.planRepo.update({ id: planId }, { paidCount: newPaidCount, status });
  }

  private async writeLedger(
    paymentId: string,
    event: LedgerEvent,
    amount: string,
    currency: string,
  ) {
    try {
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(PaymentLedger)
        .values({
          paymentId,
          event,
          amount,
          currency,
          metadata: { source: 'installment_worker' },
        })
        .execute();
    } catch (err) {
      this.logger.error(
        `Ledger write failed for ${paymentId}: ${(err as Error).message}`,
      );
    }
  }

  private isManualTrigger(): boolean {
    // Can be extended: check AsyncLocalStorage / request scope
    return false;
  }
}
