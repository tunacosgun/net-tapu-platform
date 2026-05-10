import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'auth', name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  username!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 20, nullable: true, unique: true })
  phone!: string | null;

  @Column({ type: 'varchar', name: 'password_hash', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', name: 'first_name', length: 100 })
  firstName!: string;

  @Column({ type: 'varchar', name: 'last_name', length: 100 })
  lastName!: string;

  @Column({ type: 'varchar', name: 'tc_kimlik_no', length: 11, nullable: true, unique: true })
  tcKimlikNo!: string | null;

  @Column({ type: 'boolean', name: 'is_verified', default: false })
  isVerified!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', name: 'google_id', length: 255, nullable: true, unique: true })
  googleId!: string | null;

  @Column({ type: 'varchar', name: 'apple_id', length: 255, nullable: true, unique: true })
  appleId!: string | null;

  @Column({ type: 'text', name: 'avatar_url', nullable: true })
  avatarUrl!: string | null;

  @Column({ name: 'notification_preferences', type: 'jsonb', nullable: true })
  notificationPreferences!: Record<string, { email: boolean; sms: boolean; push: boolean }> | null;

  @Column({ name: 'show_avatar_in_auction', type: 'boolean', default: true })
  showAvatarInAuction!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'referral_code', type: 'varchar', length: 12, nullable: true, unique: true })
  referralCode!: string | null;

  @Column({ name: 'referred_by', type: 'uuid', nullable: true })
  referredBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
