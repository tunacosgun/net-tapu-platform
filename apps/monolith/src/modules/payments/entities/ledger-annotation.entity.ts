import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'payments', name: 'ledger_annotations' })
export class LedgerAnnotation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ledger_entry_id', type: 'uuid' })
  ledgerEntryId!: string;

  @Column({ type: 'varchar', name: 'annotation_type', length: 50 })
  annotationType!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'annotated_by', type: 'uuid' })
  annotatedBy!: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
