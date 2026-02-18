import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'listings', name: 'parcel_status_history' })
export class ParcelStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'parcel_id', type: 'uuid' })
  parcelId!: string;

  @Column({ type: 'varchar', name: 'from_status', nullable: true })
  fromStatus!: string | null;

  @Column({ type: 'varchar', name: 'to_status' })
  toStatus!: string;

  @Column({ name: 'changed_by', type: 'uuid' })
  changedBy!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
