// ─── transaction.service.ts ───────────────────────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities';

export interface CursorPaginationQuery {
  cursor?: string; // base64-encoded {createdAt, id}
  limit?: number;
}

export interface CursorPaginationResult<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private txRepo: Repository<Transaction>,
  ) {}

  async findByUser(
    userId: string,
    query: CursorPaginationQuery,
  ): Promise<CursorPaginationResult<any>> {
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const qb = this.txRepo
      .createQueryBuilder('t')
      .where('t.userId = :userId', { userId })
      .orderBy('t.createdAt', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .take(limit + 1); // fetch one extra to determine hasMore

    if (query.cursor) {
      const { createdAt, id } = decodeCursor(query.cursor);
      qb.andWhere(
        '(t.createdAt < :createdAt OR (t.createdAt = :createdAt AND t.id < :id))',
        { createdAt, id },
      );
    }

    const [txs, total] = await Promise.all([
      qb.getMany(),
      this.txRepo.count({ where: { userId } }),
    ]);

    const hasMore = txs.length > limit;
    const data = hasMore ? txs.slice(0, limit) : txs;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last
      ? encodeCursor(last.createdAt, last.id)
      : null;

    return {
      data: data.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        type: tx.type,
        status: tx.status,
        fromCurrency: tx.fromCurrency,
        toCurrency: tx.toCurrency,
        amount: parseFloat(tx.amount),
        convertedAmount: tx.convertedAmount ? parseFloat(tx.convertedAmount) : null,
        rate: tx.rate ? parseFloat(tx.rate) : null,
        rateTimestamp: tx.rateTimestamp ?? null,
        metadata: tx.metadata,
        createdAt: tx.createdAt,
      })),
      meta: { total, limit, nextCursor, hasMore },
    };
  }
}