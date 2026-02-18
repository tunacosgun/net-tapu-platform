import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'auctions', name: 'settlement_manifests' })
export class SettlementManifest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'auction_id', type: 'uuid', unique: true })
  auctionId!: string;

  @Column({ name: 'manifest_data', type: 'jsonb' })
  manifestData!: Record<string, unknown>;

  @Column({ type: 'enum', enum: ['active', 'completed', 'expired', 'escalated'], default: 'active' })
  status!: string;

  @Column({ type: 'integer', name: 'items_total', default: 0 })
  itemsTotal!: number;

  @Column({ type: 'integer', name: 'items_acknowledged', default: 0 })
  itemsAcknowledged!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'expired_at', type: 'timestamptz', nullable: true })
  expiredAt!: Date | null;
}
