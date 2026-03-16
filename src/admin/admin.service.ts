// ─── admin.service.ts ───────────────────────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, Transaction, Wallet, WalletBalance } from '../entities';
import { TransactionStatus } from '../common/enums';

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(Wallet) private walletRepo: Repository<Wallet>,
  ) {}

  async getUsers(cursor?: string, limit = 20) {
    const take = Math.min(100, Math.max(1, limit));

    const qb = this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.wallet', 'wallet')
      .leftJoinAndSelect('wallet.balances', 'balances')
      .orderBy('u.createdAt', 'DESC')
      .addOrderBy('u.id', 'DESC')
      .take(take + 1);

    if (cursor) {
      const { createdAt, id } = decodeCursor(cursor);
      qb.andWhere(
        '(u.createdAt < :createdAt OR (u.createdAt = :createdAt AND u.id < :id))',
        { createdAt, id },
      );
    }

    const [users, total] = await Promise.all([
      qb.getMany(),
      this.userRepo.count(),
    ]);

    const hasMore = users.length > take;
    const data = hasMore ? users.slice(0, take) : users;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last
      ? encodeCursor(last.createdAt, last.id)
      : null;

    return {
      data: data.map((u) => ({
        id: u.id,
        email: u.email,
        isVerified: u.isVerified,
        role: u.role,
        createdAt: u.createdAt,
        balances: u.wallet?.balances?.map((b) => ({
          currency: b.currency,
          balance: parseFloat(b.balance),
        })) ?? [],
      })),
      meta: { total, limit: take, nextCursor, hasMore },
    };
  }

  async getTransactions(cursor?: string, limit = 20) {
    const take = Math.min(100, Math.max(1, limit));

    const qb = this.txRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.user', 'user')
      .orderBy('tx.createdAt', 'DESC')
      .addOrderBy('tx.id', 'DESC')
      .take(take + 1);

    if (cursor) {
      const { createdAt, id } = decodeCursor(cursor);
      qb.andWhere(
        '(tx.createdAt < :createdAt OR (tx.createdAt = :createdAt AND tx.id < :id))',
        { createdAt, id },
      );
    }

    const [txs, total] = await Promise.all([
      qb.getMany(),
      this.txRepo.count(),
    ]);

    const hasMore = txs.length > take;
    const data = hasMore ? txs.slice(0, take) : txs;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last
      ? encodeCursor(last.createdAt, last.id)
      : null;

    return {
      data: data.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        userEmail: tx.user?.email,
        type: tx.type,
        status: tx.status,
        fromCurrency: tx.fromCurrency,
        toCurrency: tx.toCurrency,
        amount: parseFloat(tx.amount),
        convertedAmount: tx.convertedAmount ? parseFloat(tx.convertedAmount) : null,
        rate: tx.rate ? parseFloat(tx.rate) : null,
        createdAt: tx.createdAt,
      })),
      meta: { total, limit: take, nextCursor, hasMore },
    };
  }

  async getStats() {
    const totalUsers = await this.userRepo.count();
    const verifiedUsers = await this.userRepo.count({ where: { isVerified: true } });
    const totalTransactions = await this.txRepo.count();

    const volumeRaw = await this.txRepo
      .createQueryBuilder('tx')
      .select('tx.type', 'type')
      .addSelect('SUM(tx.amount::numeric)', 'volume')
      .addSelect('COUNT(*)', 'count')
      .where('tx.status = :status', { status: TransactionStatus.SUCCESS })
      .groupBy('tx.type')
      .getRawMany();

    const volume: Record<string, { volume: number; count: number }> = {};
    for (const row of volumeRaw) {
      volume[row.type] = {
        volume: parseFloat(row.volume) || 0,
        count: parseInt(row.count) || 0,
      };
    }

    const dailyRaw = await this.txRepo
      .createQueryBuilder('tx')
      .select("DATE_TRUNC('day', tx.createdAt)", 'day')
      .addSelect('COUNT(*)', 'count')
      .where("tx.createdAt >= NOW() - INTERVAL '7 days'")
      .groupBy("DATE_TRUNC('day', tx.createdAt)")
      .orderBy("DATE_TRUNC('day', tx.createdAt)", 'ASC')
      .getRawMany();

    return {
      totalUsers,
      verifiedUsers,
      unverifiedUsers: totalUsers - verifiedUsers,
      totalTransactions,
      volumeByType: volume,
      dailyActivity: dailyRaw.map((r) => ({
        day: r.day,
        count: parseInt(r.count),
      })),
    };
  }
}