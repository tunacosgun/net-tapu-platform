import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ schema: 'auctions', name: 'auction_consents' })
export class AuctionConsent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'auction_id', type: 'uuid' })
  auctionId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', name: 'consent_text_hash', length: 64 })
  consentTextHash!: string;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', name: 'user_agent', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'accepted_at', type: 'timestamptz' })
  acceptedAt!: Date;
}
