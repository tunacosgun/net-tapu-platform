import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'payments', name: 'installment_plans' })
export class InstallmentPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'parcel_id', type: 'uuid' })
  parcelId!: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 15, scale: 2 })
  totalAmount!: string;

  @Column({ type: 'integer', name: 'installment_count' })
  installmentCount!: number;

  @Column({ type: 'integer', name: 'paid_count', default: 0 })
  paidCount!: number;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency!: string;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status!: string;

  @Column({ name: 'plan_details', type: 'jsonb' })
  planDetails!: Record<string, unknown>;

  @Column({ name: 'card_token', type: 'varchar', length: 500, nullable: true })
  cardToken!: string | null;

  @Column({ name: 'auto_charge', type: 'boolean', default: true })
  autoCharge!: boolean;

  @Column({ name: 'auction_id', type: 'uuid', nullable: true })
  auctionId!: string | null;

  @Column({ name: 'first_due_date', type: 'date', nullable: true })
  firstDueDate!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
