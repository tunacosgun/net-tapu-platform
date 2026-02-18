import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'listings', name: 'parcel_documents' })
export class ParcelDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'parcel_id', type: 'uuid' })
  parcelId!: string;

  @Column({ type: 'varchar', name: 'document_type', length: 100 })
  documentType!: string;

  @Column({ type: 'varchar', name: 'file_url', length: 1000 })
  fileUrl!: string;

  @Column({ type: 'varchar', name: 'file_name', length: 255 })
  fileName!: string;

  @Column({ type: 'integer', name: 'file_size_bytes', nullable: true })
  fileSizeBytes!: number | null;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
