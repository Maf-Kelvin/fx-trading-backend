// ─── data-source.ts ───────────────────────────────────────────────────────
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from '../entities/user.entity';
import { Otp } from '../entities/otp.entity';
import { Wallet } from '../entities/wallet.entity';
import { WalletBalance } from '../entities/wallet-balance.entity';
import { LedgerEntry } from '../entities/ledger-entry.entity';
import { Transaction } from '../entities/transaction.entity';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'fx_trading',
  entities: [User, Otp, Wallet, WalletBalance, LedgerEntry, Transaction],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});