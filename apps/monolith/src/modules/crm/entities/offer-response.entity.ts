import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'crm', name: 'offer_responses' })
export class OfferResponse {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'offer_id', type: 'uuid' })
  offerId!: string;

  @Column({ name: 'responded_by', type: 'uuid' })
  respondedBy!: string;

  @Column({ type: 'varchar', name: 'response_type', length: 50 })
  responseType!: string;

  @Column({ name: 'counter_amount', type: 'numeric', precision: 15, scale: 2, nullable: true })
  counterAmount!: string | null;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
