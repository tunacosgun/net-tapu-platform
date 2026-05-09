import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type InstallmentStatus = 'pending' | 'paid' | 'failed' | 'overdue' | 'cancelled';

@Entity({ schema: 'payments', name: 'installments' })
@Index(['planId'])
@Index(['status', 'dueDate'])
export class Installment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @Column({ name: 'sequence_no', type: 'integer' })
  sequenceNo!: number;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency!: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  status!: InstallmentStatus;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount!: number;

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId!: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
