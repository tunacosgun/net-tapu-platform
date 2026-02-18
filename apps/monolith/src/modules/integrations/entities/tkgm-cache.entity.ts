import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ schema: 'integrations', name: 'tkgm_cache' })
export class TkgmCache {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  ada!: string;

  @Column({ type: 'varchar', length: 20 })
  parsel!: string;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 100 })
  district!: string;

  @Column({ name: 'response_data', type: 'jsonb' })
  responseData!: Record<string, unknown>;

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
