import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'auctions', name: 'bids_corrections' })
export class BidCorrection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'original_bid_id', type: 'uuid' })
  originalBidId!: string;

  @Column({ type: 'varchar', name: 'correction_type', length: 50 })
  correctionType!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'corrected_by', type: 'uuid' })
  correctedBy!: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;
}
