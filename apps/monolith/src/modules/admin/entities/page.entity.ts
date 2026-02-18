import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'admin', name: 'pages' })
export class Page {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'page_type', type: 'enum', enum: ['about', 'vision', 'mission', 'legal_info', 'real_estate_concepts', 'withdrawal_info', 'post_sale', 'press', 'custom'] })
  pageType!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  content!: string | null;

  @Column({ type: 'varchar', name: 'meta_title', length: 200, nullable: true })
  metaTitle!: string | null;

  @Column({ type: 'varchar', name: 'meta_description', length: 500, nullable: true })
  metaDescription!: string | null;

  @Column({ type: 'enum', enum: ['draft', 'published', 'archived'], default: 'draft' })
  status!: string;

  @Column({ type: 'integer', name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
