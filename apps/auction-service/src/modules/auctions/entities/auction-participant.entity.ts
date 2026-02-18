import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ schema: 'auctions', name: 'auction_participants' })
export class AuctionParticipant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'auction_id', type: 'uuid' })
  auctionId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'deposit_id', type: 'uuid' })
  depositId!: string;

  @Column({ type: 'boolean', default: true })
  eligible!: boolean;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'varchar', name: 'revoke_reason', length: 500, nullable: true })
  revokeReason!: string | null;

  @Column({ name: 'registered_at', type: 'timestamptz' })
  registeredAt!: Date;
}
