import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ schema: 'integrations', name: 'ekent_cache' })
@Index(['city', 'district', 'ada', 'parsel'], { unique: true })
export class EkentCache {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 100 })
  district!: string;

  @Column({ type: 'varchar', length: 20 })
  ada!: string;

  @Column({ type: 'varchar', length: 20 })
  parsel!: string;

  @Column({ name: 'resolved_url', type: 'text', nullable: true })
  resolvedUrl!: string | null;

  @Column({ name: 'imar_data', type: 'jsonb', nullable: true })
  imarData!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 50 })
  source!: 'provider' | 'manual' | 'fallback';

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
