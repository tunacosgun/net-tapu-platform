import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Deposit } from './entities/deposit.entity';
import { DepositTransition } from './entities/deposit-transition.entity';
import { Payment } from './entities/payment.entity';
import { PaymentLedger } from './entities/payment-ledger.entity';
import { PosTransaction } from './entities/pos-transaction.entity';
import { Refund } from './entities/refund.entity';
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
