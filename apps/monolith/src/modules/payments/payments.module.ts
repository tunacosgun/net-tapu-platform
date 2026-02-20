import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Deposit, DepositTransition, PaymentLedger, Refund } from '@nettapu/shared';
import { Payment } from './entities/payment.entity';
import { PosTransaction } from './entities/pos-transaction.entity';
import { InstallmentPlan } from './entities/installment-plan.entity';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { LedgerAnnotation } from './entities/ledger-annotation.entity';

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
      IdempotencyKey,
      LedgerAnnotation,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class PaymentsModule {}
