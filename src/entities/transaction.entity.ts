// ─── transaction.entity.ts ───────────────────────────────────────────────────────
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Currency, TransactionType, TransactionStatus } from '../common/enums';
import { User } from './user.entity';

@Entity('transactions')
@Index(['userId', 'createdAt']) // composite index for cursor pagination
@Index(['createdAt'])           // admin list ordering
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (u) => u.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ unique: true })
  reference: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @Column({ type: 'enum', enum: Currency })
  fromCurrency: Currency;

  @Column({ type: 'enum', enum: Currency, nullable: true })
  toCurrency: Currency;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  amount: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  convertedAmount: string;

  @Column({ type: 'decimal', precision: 18, scale: 10, nullable: true })
  rate: string;

  @Column({ type: 'timestamptz', nullable: true })
  rateTimestamp: Date;

  @Column({ nullable: true, unique: true })
  idempotencyKey: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}