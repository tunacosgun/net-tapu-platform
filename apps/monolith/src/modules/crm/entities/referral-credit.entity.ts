import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type ReferralCreditStatus =
  | 'pending'
  | 'available'
  | 'used'
  | 'expired'
  | 'cancelled';

export type ReferralCreditType = 'discount' | 'cash' | 'coupon';

@Entity({ schema: 'crm', name: 'referral_credits' })
@Index(['userId', 'status'])
export class ReferralCredit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'source_user_id', type: 'uuid' })
  sourceUserId!: string;

  @Column({ type: 'varchar', length: 20, default: 'discount' })
  type!: ReferralCreditType;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: ReferralCreditStatus;

  @Column({ name: 'trigger_event', type: 'varchar', length: 50 })
  triggerEvent!: string;

  @Column({ name: 'trigger_payment_id', type: 'uuid', nullable: true })
  triggerPaymentId!: string | null;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
