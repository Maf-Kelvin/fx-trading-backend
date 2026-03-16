// ─── user.entity.ts ───────────────────────────────────────────────────────
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany, OneToOne,
} from 'typeorm';
import { Otp } from './otp.entity';
import { Wallet } from './wallet.entity';
import { Transaction } from './transaction.entity';
import { UserRole } from '../common/enums';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Otp, (otp) => otp.user)
  otps: Otp[];

  @OneToOne(() => Wallet, (wallet) => wallet.user)
  wallet: Wallet;

  @OneToMany(() => Transaction, (t) => t.user)
  transactions: Transaction[];
}