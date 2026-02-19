import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, VersionColumn } from 'typeorm';

@Entity({ schema: 'auctions', name: 'auctions' })
export class Auction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'parcel_id', type: 'uuid' })
  parcelId!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: ['draft', 'scheduled', 'deposit_open', 'live', 'ending', 'ended', 'settling', 'settled', 'settlement_failed', 'cancelled'], default: 'draft' })
  status!: string;

  @Column({ name: 'starting_price', type: 'numeric', precision: 15, scale: 2 })
  startingPrice!: string;

  @Column({ name: 'minimum_increment', type: 'numeric', precision: 15, scale: 2 })
  minimumIncrement!: string;

  @Column({ name: 'current_price', type: 'numeric', precision: 15, scale: 2, nullable: true })
  currentPrice!: string | null;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency!: string;

  @Column({ name: 'required_deposit', type: 'numeric', precision: 15, scale: 2 })
  requiredDeposit!: string;

  // Frozen after 'ended' (DB trigger enforced)
  @Column({ name: 'final_price', type: 'numeric', precision: 15, scale: 2, nullable: true })
  finalPrice!: string | null;

  @Column({ name: 'winner_id', type: 'uuid', nullable: true })
  winnerId!: string | null;

  @Column({ name: 'winner_bid_id', type: 'uuid', nullable: true })
  winnerBidId!: string | null;

  @Column({ name: 'deposit_deadline', type: 'timestamptz' })
  depositDeadline!: Date;

  @Column({ name: 'scheduled_start', type: 'timestamptz' })
  scheduledStart!: Date;

  @Column({ name: 'scheduled_end', type: 'timestamptz', nullable: true })
  scheduledEnd!: Date | null;

  @Column({ name: 'actual_start', type: 'timestamptz', nullable: true })
  actualStart!: Date | null;

  // Frozen after 'ended' (DB trigger enforced)
  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ name: 'extended_until', type: 'timestamptz', nullable: true })
  extendedUntil!: Date | null;

  @Column({ type: 'integer', name: 'bid_count', default: 0 })
  bidCount!: number;

  @Column({ type: 'integer', name: 'participant_count', default: 0 })
  participantCount!: number;

  @Column({ type: 'integer', name: 'watcher_count', default: 0 })
  watcherCount!: number;

  @Column({ name: 'settlement_metadata', type: 'jsonb', nullable: true })
  settlementMetadata!: Record<string, unknown> | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @VersionColumn()
  version!: number;
}
