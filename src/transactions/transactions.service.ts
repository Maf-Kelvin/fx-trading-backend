// ─── transactions.service.ts ──────────────────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities';

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private txRepo: Repository<Transaction>,
  ) {}

  async findByUser(userId: string, query: PaginationQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const [txs, total] = await this.txRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip,
    });

    return {
      data: txs.map((tx) => ({
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
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}