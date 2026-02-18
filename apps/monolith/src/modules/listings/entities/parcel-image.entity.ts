import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'listings', name: 'parcel_images' })
export class ParcelImage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'parcel_id', type: 'uuid' })
  parcelId!: string;

  @Column({ type: 'varchar', name: 'original_url', length: 1000 })
  originalUrl!: string;

  @Column({ type: 'varchar', name: 'watermarked_url', length: 1000, nullable: true })
  watermarkedUrl!: string | null;

  @Column({ type: 'varchar', name: 'thumbnail_url', length: 1000, nullable: true })
  thumbnailUrl!: string | null;

  @Column({ type: 'enum', enum: ['uploading', 'processing', 'ready', 'failed'], default: 'uploading' })
  status!: string;

  @Column({ type: 'integer', name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', name: 'is_cover', default: false })
  isCover!: boolean;

  @Column({ type: 'integer', name: 'file_size_bytes', nullable: true })
  fileSizeBytes!: number | null;

  @Column({ type: 'varchar', name: 'mime_type', length: 50, nullable: true })
  mimeType!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
