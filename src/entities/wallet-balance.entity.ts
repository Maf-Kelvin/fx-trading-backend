import {
  Entity, PrimaryGeneratedColumn, Column,
  UpdateDateColumn, ManyToOne, JoinColumn, Unique, Index,
} from 'typeorm';
import { Currency } from '../common/enums';
import { Wallet } from './wallet.entity';

@Entity('wallet_balances')
@Unique(['walletId', 'currency'])
@Index(['walletId', 'currency'])
export class WalletBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  walletId: string;

  @ManyToOne(() => Wallet, (w) => w.balances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  @Column({ type: 'enum', enum: Currency })
  currency: Currency;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: '0' })
  balance: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: '0' })
  lockedBalance: string;

  @UpdateDateColumn()
  updatedAt: Date;
}