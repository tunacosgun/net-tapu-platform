import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'listings', name: 'parcel_map_data' })
export class ParcelMapData {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'parcel_id', type: 'uuid', unique: true })
  parcelId!: string;

  @Column({ name: 'boundary_geojson', type: 'jsonb', nullable: true })
  boundaryGeojson!: Record<string, unknown> | null;

  @Column({ name: 'tkgm_data', type: 'jsonb', nullable: true })
  tkgmData!: Record<string, unknown> | null;

  @Column({ type: 'varchar', name: 'ekent_url', length: 1000, nullable: true })
  ekentUrl!: string | null;

  @Column({ name: 'google_earth_kml', type: 'text', nullable: true })
  googleEarthKml!: string | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
