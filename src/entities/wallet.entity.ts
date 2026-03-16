import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, OneToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { WalletBalance } from './wallet-balance.entity';
import { LedgerEntry } from './ledger-entry.entity';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => User, (u) => u.wallet)
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => WalletBalance, (wb) => wb.wallet, { cascade: true, eager: true })
  balances: WalletBalance[];

  @OneToMany(() => LedgerEntry, (le) => le.wallet)
  ledgerEntries: LedgerEntry[];

  @CreateDateColumn()
  createdAt: Date;
}