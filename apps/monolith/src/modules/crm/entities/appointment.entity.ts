import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'crm', name: 'appointments' })
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'parcel_id', type: 'uuid', nullable: true })
  parcelId!: string | null;

  @Column({ name: 'consultant_id', type: 'uuid', nullable: true })
  consultantId!: string | null;

  @Column({ name: 'contact_request_id', type: 'uuid', nullable: true })
  contactRequestId!: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ type: 'integer', name: 'duration_minutes', default: 30 })
  durationMinutes!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  location!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'scheduled' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
