import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// APPEND-ONLY: No UPDATE or DELETE allowed (DB trigger enforced)
@Entity({ schema: 'auctions', name: 'bid_rejections' })
export class BidRejection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'auction_id', type: 'uuid' })
  auctionId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'attempted_amount', type: 'numeric', precision: 15, scale: 2 })
  attemptedAmount!: string;

  @Column({ type: 'enum', enum: ['insufficient_deposit', 'price_changed', 'amount_already_bid', 'auction_not_live', 'user_not_eligible', 'rate_limited', 'consent_missing', 'below_minimum_increment'] })
  reason!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  details!: string | null;

  @Column({ name: 'server_ts', type: 'timestamptz' })
  serverTs!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
