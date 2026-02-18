import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'campaigns', name: 'campaigns' })
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'campaign_type', type: 'enum', enum: ['discount', 'installment', 'special_pricing', 'gamification'] })
  campaignType!: string;

  @Column({ type: 'enum', enum: ['draft', 'active', 'paused', 'ended'], default: 'draft' })
  status!: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ name: 'discount_percent', type: 'numeric', precision: 5, scale: 2, nullable: true })
  discountPercent!: string | null;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 15, scale: 2, nullable: true })
  discountAmount!: string | null;

  @Column({ type: 'integer', name: 'max_uses', nullable: true })
  maxUses!: number | null;

  @Column({ type: 'integer', name: 'current_uses', default: 0 })
  currentUses!: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
