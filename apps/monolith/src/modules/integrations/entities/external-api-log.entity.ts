import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'integrations', name: 'external_api_log' })
export class ExternalApiLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  provider!: string;

  @Column({ type: 'varchar', length: 500 })
  endpoint!: string;

  @Column({ type: 'varchar', length: 10 })
  method!: string;

  @Column({ name: 'request_payload', type: 'jsonb', nullable: true })
  requestPayload!: Record<string, unknown> | null;

  @Column({ type: 'integer', name: 'response_status', nullable: true })
  responseStatus!: number | null;

  @Column({ name: 'response_payload', type: 'jsonb', nullable: true })
  responsePayload!: Record<string, unknown> | null;

  @Column({ type: 'integer', name: 'duration_ms', nullable: true })
  durationMs!: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
