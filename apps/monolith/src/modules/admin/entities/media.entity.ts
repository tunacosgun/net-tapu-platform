import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'admin', name: 'media' })
export class Media {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', name: 'file_url', length: 1000 })
  fileUrl!: string;

  @Column({ type: 'varchar', name: 'thumbnail_url', length: 1000, nullable: true })
  thumbnailUrl!: string | null;

  @Column({ type: 'varchar', name: 'media_type', length: 50 })
  mediaType!: string;

  @Column({ type: 'varchar', name: 'mime_type', length: 100, nullable: true })
  mimeType!: string | null;

  @Column({ type: 'integer', name: 'file_size_bytes', nullable: true })
  fileSizeBytes!: number | null;

  @Column({ type: 'boolean', name: 'is_popup', default: false })
  isPopup!: boolean;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
