import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'auth', name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
