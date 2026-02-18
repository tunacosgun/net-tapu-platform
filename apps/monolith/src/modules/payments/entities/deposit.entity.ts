import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'payments', name: 'deposits' })
export class Deposit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'auction_id', type: 'uuid' })
  auctionId!: string;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency!: string;

  @Column({ type: 'enum', enum: ['collected', 'held', 'captured', 'refund_pending', 'refunded', 'expired'], default: 'collected' })
  status!: string;

  @Column({ name: 'payment_method', type: 'enum', enum: ['credit_card', 'bank_transfer', 'mail_order'] })
  paymentMethod!: string;

  @Column({ name: 'pos_provider', type: 'enum', enum: ['paytr', 'iyzico', 'moka'], nullable: true })
  posProvider!: string | null;

  @Column({ type: 'varchar', name: 'pos_transaction_id', length: 255, nullable: true })
  posTransactionId!: string | null;

  @Column({ type: 'varchar', name: 'idempotency_key', length: 255, unique: true })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
