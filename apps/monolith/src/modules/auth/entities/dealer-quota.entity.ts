import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'auth', name: 'dealer_quotas' })
export class DealerQuota {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId!: string;

  @Column({ type: 'integer', name: 'max_listings', default: 0 })
  maxListings!: number;

  @Column({ type: 'integer', name: 'max_active_listings', default: 0 })
  maxActiveListings!: number;

  @Column({ name: 'region_restriction', type: 'jsonb', nullable: true })
  regionRestriction!: Record<string, unknown> | null;

  @Column({ name: 'commission_rate', type: 'numeric', precision: 5, scale: 4, nullable: true })
  commissionRate!: string | null;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom!: Date;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
