import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Currency, LedgerEntryType } from '../common/enums';
import { Wallet } from './wallet.entity';

@Entity('ledger_entries')
@Index(['walletId'])
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  walletId: string;

  @ManyToOne(() => Wallet, (w) => w.ledgerEntries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  @Column({ type: 'enum', enum: Currency })
  currency: Currency;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  amount: string;

  @Column({ type: 'enum', enum: LedgerEntryType })
  entryType: LedgerEntryType;

  @Column({ nullable: true })
  reference: string;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  rate: string;

  @Column({ type: 'timestamptz', nullable: true })
  rateTimestamp: Date;

  @CreateDateColumn()
  createdAt: Date;
}