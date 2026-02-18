import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'listings', name: 'parcels' })
export class Parcel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', name: 'listing_id', length: 20, unique: true })
  listingId!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: ['draft', 'active', 'deposit_taken', 'sold', 'withdrawn'], default: 'draft' })
  status!: string;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 100 })
  district!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  neighborhood!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  latitude!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  longitude!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  ada!: string | null;

  @Column({ type: 'varchar', name: 'parsel', length: 20, nullable: true })
  parsel!: string | null;

  @Column({ name: 'area_m2', type: 'numeric', precision: 12, scale: 2, nullable: true })
  areaM2!: string | null;

  @Column({ type: 'varchar', name: 'zoning_status', length: 200, nullable: true })
  zoningStatus!: string | null;

  @Column({ type: 'varchar', name: 'land_type', length: 100, nullable: true })
  landType!: string | null;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  price!: string | null;

  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  currency!: string;

  @Column({ name: 'price_per_m2', type: 'numeric', precision: 12, scale: 2, nullable: true })
  pricePerM2!: string | null;

  @Column({ type: 'boolean', name: 'is_auction_eligible', default: false })
  isAuctionEligible!: boolean;

  @Column({ type: 'boolean', name: 'is_featured', default: false })
  isFeatured!: boolean;

  @Column({ type: 'boolean', name: 'show_listing_date', default: true })
  showListingDate!: boolean;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'assigned_consultant', type: 'uuid', nullable: true })
  assignedConsultant!: string | null;

  @Column({ name: 'listed_at', type: 'timestamptz', nullable: true })
  listedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
