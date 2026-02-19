import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// APPEND-ONLY: No UPDATE or DELETE allowed (DB trigger enforced)
@Entity({ schema: 'auctions', name: 'bids' })
export class Bid {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'auction_id', type: 'uuid' })
  auctionId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount!: string;

  @Column({ name: 'reference_price', type: 'numeric', precision: 15, scale: 2 })
  referencePrice!: string;

  @Column({ type: 'varchar', name: 'idempotency_key', length: 255, unique: true })
  idempotencyKey!: string;

  // AUTHORITATIVE timestamp — PostgreSQL NOW() at INSERT time
  @Column({ name: 'server_ts', type: 'timestamptz' })
  serverTs!: Date;

  @Column({ name: 'client_sent_at', type: 'timestamptz', nullable: true })
  clientSentAt!: Date | null;

  @Column({ name: 'gateway_received_at', type: 'timestamptz', nullable: true })
  gatewayReceivedAt!: Date | null;

  @Column({ name: 'processor_dequeued_at', type: 'timestamptz', nullable: true })
  processorDequeuedAt!: Date | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
