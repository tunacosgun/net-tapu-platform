import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ schema: 'auth', name: 'consents' })
export class Consent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'consent_type', type: 'enum', enum: ['terms_of_service', 'privacy_policy', 'kvkk', 'auction_rules', 'marketing_communications'] })
  consentType!: string;

  @Column({ type: 'varchar', length: 20 })
  version!: string;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', name: 'user_agent', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'accepted_at', type: 'timestamptz' })
  acceptedAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
