import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InstallmentService } from './installment.service';

/**
 * Daily cron worker that scans installments with due_date <= today AND
 * status='pending' and triggers POS captures.
 *
 * Disabled by default — enable with INSTALLMENT_WORKER_ENABLED=true.
 * Run time configurable via INSTALLMENT_WORKER_CRON (default 09:00 daily).
 */
@Injectable()
export class InstallmentWorker {
  private readonly logger = new Logger(InstallmentWorker.name);
  private running = false;

  constructor(
    private readonly installmentService: InstallmentService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailyCharge(): Promise<void> {
    const enabled =
      this.config.get<string>('INSTALLMENT_WORKER_ENABLED', 'false') === 'true';
    if (!enabled) return;

    if (this.running) {
      this.logger.warn('Installment worker already running, skipping tick');
      return;
    }
    this.running = true;

    const startedAt = Date.now();
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    try {
      const due = await this.installmentService.findDueInstallments();
      this.logger.log(
        JSON.stringify({
          event: 'installment_worker_tick_start',
          due_count: due.length,
        }),
      );

      for (const inst of due) {
        processed++;
        try {
          const result = await this.installmentService.processInstallment(inst.id);
          if (result.success) succeeded++;
          else failed++;
        } catch (err) {
          failed++;
          this.logger.error(
            `Installment ${inst.id} processing crashed: ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(
        JSON.stringify({
          event: 'installment_worker_tick_complete',
          processed,
          succeeded,
          failed,
          duration_ms: Date.now() - startedAt,
        }),
      );
    } finally {
      this.running = false;
    }
  }
}
