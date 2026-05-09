import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Deposit, DepositTransition, PaymentLedger, Refund, POS_GATEWAY } from '@nettapu/shared';
import { Payment } from './entities/payment.entity';
import { PosTransaction } from './entities/pos-transaction.entity';
import { InstallmentPlan } from './entities/installment-plan.entity';
import { Installment } from './entities/installment.entity';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { LedgerAnnotation } from './entities/ledger-annotation.entity';
import { ReconciliationRun } from './entities/reconciliation-run.entity';
import { PaymentService } from './services/payment.service';
import { RefundService } from './services/refund.service';
import { ReconciliationService } from './services/reconciliation.service';
import { ReconciliationWorker } from './services/reconciliation.worker';
import { PosCallbackService } from './services/pos-callback.service';
import { FinancialLogger } from './services/financial-logger.service';
import { InstallmentService } from './services/installment.service';
import { InstallmentWorker } from './services/installment.worker';
import { posGatewayFactory } from './services/pos-gateway.factory';
import { PaymentController } from './controllers/payment.controller';
import { DepositController } from './controllers/deposit.controller';
import { RefundController } from './controllers/refund.controller';
import { ReconciliationController } from './controllers/reconciliation.controller';
import { PosCallbackController } from './controllers/pos-callback.controller';
import { AdminDepositController } from './controllers/admin-deposit.controller';
import { AdminFinanceSummaryController } from './controllers/admin-finance-summary.controller';
import { AdminInstallmentController } from './controllers/admin-installment.controller';
import { InstallmentController } from './controllers/installment.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Deposit,
      DepositTransition,
      Payment,
      PaymentLedger,
      PosTransaction,
      Refund,
      InstallmentPlan,
      Installment,
      IdempotencyKey,
      LedgerAnnotation,
      ReconciliationRun,
    ]),
  ],
  controllers: [
    PaymentController,
    DepositController,
    RefundController,
    ReconciliationController,
    PosCallbackController,
    AdminDepositController,
    AdminFinanceSummaryController,
    AdminInstallmentController,
    InstallmentController,
  ],
  providers: [
    PaymentService,
    RefundService,
    ReconciliationService,
    PosCallbackService,
    ReconciliationWorker,
    FinancialLogger,
    InstallmentService,
    InstallmentWorker,
    {
      provide: POS_GATEWAY,
      useFactory: posGatewayFactory,
      inject: [ConfigService],
    },
  ],
  exports: [PaymentService, RefundService, FinancialLogger, InstallmentService],
})
export class PaymentsModule {}
