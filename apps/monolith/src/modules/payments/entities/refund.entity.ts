import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ schema: 'payments', name: 'refunds' })
export class Refund {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'deposit_id', type: 'uuid', nullable: true })
  depositId!: string | null;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId!: string | null;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency!: string;

  @Column({ type: 'varchar', length: 500 })
  reason!: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status!: string;

  @Column({ type: 'varchar', name: 'pos_refund_id', length: 255, nullable: true })
  posRefundId!: string | null;

  @Column({ type: 'varchar', name: 'idempotency_key', length: 255, unique: true })
  idempotencyKey!: string;

  @Column({ name: 'initiated_at', type: 'timestamptz' })
  initiatedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
