import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'payments', name: 'deposit_transitions' })
export class DepositTransition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'deposit_id', type: 'uuid' })
  depositId!: string;

  @Column({ type: 'varchar', name: 'from_status', nullable: true })
  fromStatus!: string | null;

  @Column({ type: 'varchar', name: 'to_status' })
  toStatus!: string;

  @Column({ type: 'varchar' })
  event!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
