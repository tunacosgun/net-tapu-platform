import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'campaigns', name: 'campaign_rules' })
export class CampaignRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId!: string;

  @Column({ type: 'varchar', name: 'rule_type', length: 100 })
  ruleType!: string;

  @Column({ name: 'rule_value', type: 'jsonb' })
  ruleValue!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
