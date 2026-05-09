import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'integrations', name: 'ekent_providers' })
export class EkentProvider {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  district!: string | null;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'url_pattern', type: 'text' })
  urlPattern!: string;

  @Column({ name: 'imar_endpoint', type: 'text', nullable: true })
  imarEndpoint!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
