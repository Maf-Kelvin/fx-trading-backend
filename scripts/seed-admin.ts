// ─── seed-admin.ts ───────────────────────────────────────────────────────
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { User } from '../src/entities/user.entity';
import { Otp } from '../src/entities/otp.entity';
import { Wallet } from '../src/entities/wallet.entity';
import { WalletBalance } from '../src/entities/wallet-balance.entity';
import { LedgerEntry } from '../src/entities/ledger-entry.entity';
import { Transaction } from '../src/entities/transaction.entity';
import { UserRole } from '../src/common/enums';

dotenv.config();

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'fx_trading',
  entities: [User, Otp, Wallet, WalletBalance, LedgerEntry, Transaction],
  synchronize: false,
});

async function seed() {
  await ds.initialize();

  const email = process.env.ADMIN_EMAIL || 'admin@fxtrading.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin123';

  const repo = ds.getRepository(User);
  const existing = await repo.findOne({ where: { email } });

  if (existing) {
    console.log(`Admin already exists: ${email}`);
    await ds.destroy();
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  const admin = repo.create({
    email,
    password: hashed,
    isVerified: true,
    role: UserRole.ADMIN,
  });
  await repo.save(admin);

  console.log(`✅ Admin created: ${email}`);
  await ds.destroy();
}

seed().catch((e) => { console.error(e); process.exit(1); });