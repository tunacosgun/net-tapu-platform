import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'crm', name: 'notification_log' })
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'queue_id', type: 'uuid', nullable: true })
  queueId!: string | null;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'enum', enum: ['sms', 'email', 'push', 'whatsapp'] })
  channel!: string;

  @Column({ type: 'enum', enum: ['queued', 'sending', 'sent', 'delivered', 'failed'] })
  status!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subject!: string | null;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'provider_response', type: 'jsonb', nullable: true })
  providerResponse!: Record<string, unknown> | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
