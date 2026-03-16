// ─── wallet.service.ts ────────────────────────────────────────────────────────
import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { Wallet, WalletBalance, LedgerEntry, Transaction, User } from '../entities';
import { FxService } from '../fx/fx.service';
import {
  Currency, TransactionType, TransactionStatus, LedgerEntryType,
} from '../common/enums';
import { ConvertDto, FundWalletDto, TradeDto, TransferDto } from './wallet.dto';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private dataSource: DataSource,
    private fxService: FxService,
  ) {}

  async getWallet(userId: string) {
    const wallet = await this.dataSource.getRepository(Wallet).findOne({
      where: { userId },
      relations: ['balances'],
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    return {
      walletId: wallet.id,
      balances: wallet.balances.map((b) => ({
        currency: b.currency,
        balance: parseFloat(b.balance),
        lockedBalance: parseFloat(b.lockedBalance),
      })),
    };
  }

  async fund(userId: string, dto: FundWalletDto) {
    // Idempotency — only check if caller explicitly provided a key
    if (dto.idempotencyKey && typeof dto.idempotencyKey === 'string' && dto.idempotencyKey.trim()) {
      const existing = await this.dataSource.getRepository(Transaction).findOne({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        return {
          idempotent: true,
          reference: existing.reference,
          message: 'Duplicate request — original result returned',
        };
      }
    }

    return this.dataSource.transaction(async (em) => {
      const wallet = await this.getWalletOrFail(em, userId);
      const balance = await this.getOrCreateBalance(em, wallet.id, dto.currency);

      const ref = uuidv4();
      const amt = new Decimal(dto.amount);
      const newBal = new Decimal(balance.balance).plus(amt);

      await em.getRepository(WalletBalance).update(balance.id, {
        balance: newBal.toFixed(6),
      });

      await em.getRepository(LedgerEntry).save(
        em.getRepository(LedgerEntry).create({
          walletId: wallet.id,
          currency: dto.currency,
          amount: amt.toFixed(6),
          entryType: LedgerEntryType.FUND,
          reference: ref,
        }),
      );

      await em.getRepository(Transaction).save(
        em.getRepository(Transaction).create({
          userId,
          reference: ref,
          type: TransactionType.FUND,
          status: TransactionStatus.SUCCESS,
          fromCurrency: dto.currency,
          amount: amt.toFixed(6),
          idempotencyKey: dto.idempotencyKey ?? null,
          metadata: {},
        }),
      );

      return {
        message: 'Wallet funded successfully',
        reference: ref,
        currency: dto.currency,
        amount: dto.amount,
        newBalance: newBal.toNumber(),
      };
    });
  }

  async transfer(senderId: string, dto: TransferDto) {
    if (dto.idempotencyKey) {
      const existing = await this.dataSource.getRepository(Transaction).findOne({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        return { idempotent: true, reference: existing.reference, message: 'Duplicate request — original result returned' };
      }
    }

    return this.dataSource.transaction(async (em) => {
      // Resolve recipient by email
      const recipient = await em.getRepository(User).findOne({
        where: { email: dto.recipientEmail },
      });
      if (!recipient) throw new NotFoundException(`No user found with email ${dto.recipientEmail}`);
      if (!recipient.isVerified) throw new BadRequestException('Recipient account is not verified');
      if (recipient.id === senderId) throw new BadRequestException('Cannot transfer to yourself');

      const senderWallet = await this.getWalletOrFail(em, senderId);
      const recipientWallet = await this.getWalletOrFail(em, recipient.id);

      // Lock sender balance
      const senderBalance = await em
        .getRepository(WalletBalance)
        .createQueryBuilder('wb')
        .setLock('pessimistic_write')
        .where('wb.walletId = :wid AND wb.currency = :cur', {
          wid: senderWallet.id, cur: dto.currency,
        })
        .getOne();

      if (!senderBalance) throw new BadRequestException(`No ${dto.currency} balance found`);

      const amt = new Decimal(dto.amount);
      const senderBal = new Decimal(senderBalance.balance);
      if (senderBal.lessThan(amt)) {
        throw new BadRequestException(
          `Insufficient balance. Available: ${senderBal.toNumber()} ${dto.currency}`,
        );
      }

      const ref = uuidv4();

      // Deduct from sender
      await em.getRepository(WalletBalance).update(senderBalance.id, {
        balance: senderBal.minus(amt).toFixed(6),
      });

      // Credit recipient (lazy-create if needed)
      const recipientBalance = await this.getOrCreateBalance(em, recipientWallet.id, dto.currency);
      await em.getRepository(WalletBalance).update(recipientBalance.id, {
        balance: new Decimal(recipientBalance.balance).plus(amt).toFixed(6),
      });

      // Ledger entries — one per wallet
      await em.getRepository(LedgerEntry).save([
        em.getRepository(LedgerEntry).create({
          walletId: senderWallet.id,
          currency: dto.currency,
          amount: amt.negated().toFixed(6),
          entryType: LedgerEntryType.TRANSFER_OUT,
          reference: ref,
        }),
        em.getRepository(LedgerEntry).create({
          walletId: recipientWallet.id,
          currency: dto.currency,
          amount: amt.toFixed(6),
          entryType: LedgerEntryType.TRANSFER_IN,
          reference: ref,
        }),
      ]);

      // Transaction records — one per user for their own history
      await em.getRepository(Transaction).save([
        em.getRepository(Transaction).create({
          userId: senderId,
          reference: ref,
          type: TransactionType.TRANSFER_OUT,
          status: TransactionStatus.SUCCESS,
          fromCurrency: dto.currency,
          amount: amt.toFixed(6),
          idempotencyKey: dto.idempotencyKey ?? null,
          metadata: { recipientEmail: dto.recipientEmail },
        }),
        em.getRepository(Transaction).create({
          userId: recipient.id,
          reference: `${ref}-in`,
          type: TransactionType.TRANSFER_IN,
          status: TransactionStatus.SUCCESS,
          fromCurrency: dto.currency,
          amount: amt.toFixed(6),
          metadata: { senderEmail: (await em.getRepository(User).findOne({ where: { id: senderId } }))?.email },
        }),
      ]);

      return {
        message: 'Transfer successful',
        reference: ref,
        to: dto.recipientEmail,
        currency: dto.currency,
        amount: amt.toNumber(),
      };
    });
  }

  async convert(userId: string, dto: ConvertDto) {
    if (dto.fromCurrency === dto.toCurrency) {
      throw new BadRequestException('Cannot convert to the same currency');
    }
    return this.executeExchange(
      userId, dto.fromCurrency, dto.toCurrency, dto.amount,
      TransactionType.CONVERT, LedgerEntryType.CONVERT,
      {}, dto.idempotencyKey || undefined,
    );
  }

  async trade(userId: string, dto: TradeDto) {
    if (dto.fromCurrency === dto.toCurrency) {
      throw new BadRequestException('Cannot trade the same currency pair');
    }
    return this.executeExchange(
      userId, dto.fromCurrency, dto.toCurrency, dto.amount,
      TransactionType.TRADE, LedgerEntryType.TRADE,
      { orderType: dto.orderType }, dto.idempotencyKey || undefined,
    );
  }

  private async executeExchange(
    userId: string,
    fromCurrency: Currency,
    toCurrency: Currency,
    amount: number,
    txType: TransactionType,
    ledgerType: LedgerEntryType,
    metadata: Record<string, any> = {},
    idempotencyKey?: string,
  ) {
    // Idempotency — only check if caller explicitly provided a key
    if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
      const existing = await this.dataSource.getRepository(Transaction).findOne({
        where: { idempotencyKey },
      });
      if (existing) {
        return {
          idempotent: true,
          reference: existing.reference,
          message: 'Duplicate request — original result returned',
        };
      }
    }

    return this.dataSource.transaction(async (em) => {
      const wallet = await this.getWalletOrFail(em, userId);

      // Row-level lock to prevent race conditions / double-spend
      const fromBalance = await em
        .getRepository(WalletBalance)
        .createQueryBuilder('wb')
        .setLock('pessimistic_write')
        .where('wb.walletId = :wid AND wb.currency = :cur', {
          wid: wallet.id,
          cur: fromCurrency,
        })
        .getOne();

      if (!fromBalance) {
        throw new BadRequestException(`No ${fromCurrency} balance found`);
      }

      const fromAmt = new Decimal(amount);
      const currentBal = new Decimal(fromBalance.balance);

      if (currentBal.lessThan(fromAmt)) {
        throw new BadRequestException(
          `Insufficient balance. Available: ${currentBal.toNumber()} ${fromCurrency}`,
        );
      }

      // Snapshot rate + timestamp together
      const rateTimestamp = new Date();
      const rate = await this.fxService.getRate(fromCurrency, toCurrency);
      const toAmt = fromAmt.times(rate);
      const ref = uuidv4();

      // Deduct from source
      await em.getRepository(WalletBalance).update(fromBalance.id, {
        balance: currentBal.minus(fromAmt).toFixed(6),
      });

      // Credit to target (lazy-create if first time holding this currency)
      const toBalance = await this.getOrCreateBalance(em, wallet.id, toCurrency);
      await em.getRepository(WalletBalance).update(toBalance.id, {
        balance: new Decimal(toBalance.balance).plus(toAmt).toFixed(6),
      });

      // Immutable ledger pair — both entries carry the rate snapshot
      await em.getRepository(LedgerEntry).save([
        em.getRepository(LedgerEntry).create({
          walletId: wallet.id,
          currency: fromCurrency,
          amount: fromAmt.negated().toFixed(6),
          entryType: ledgerType,
          reference: ref,
          rate: rate.toFixed(8),
          rateTimestamp,
        }),
        em.getRepository(LedgerEntry).create({
          walletId: wallet.id,
          currency: toCurrency,
          amount: toAmt.toFixed(6),
          entryType: ledgerType,
          reference: ref,
          rate: rate.toFixed(8),
          rateTimestamp,
        }),
      ]);

      // Transaction record
      await em.getRepository(Transaction).save(
        em.getRepository(Transaction).create({
          userId,
          reference: ref,
          type: txType,
          status: TransactionStatus.SUCCESS,
          fromCurrency,
          toCurrency,
          amount: fromAmt.toFixed(6),
          convertedAmount: toAmt.toFixed(6),
          rate: rate.toFixed(10),
          rateTimestamp,
          idempotencyKey: idempotencyKey ?? null,
          metadata,
        }),
      );

      return {
        message: `${txType.toLowerCase()} executed successfully`,
        reference: ref,
        from: { currency: fromCurrency, amount: fromAmt.toNumber() },
        to: { currency: toCurrency, amount: toAmt.toNumber() },
        rate: rate.toNumber(),
        rateTimestamp: rateTimestamp.toISOString(),
      };
    });
  }

  private async getWalletOrFail(em: EntityManager, userId: string): Promise<Wallet> {
    const wallet = await em.getRepository(Wallet).findOne({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  private async getOrCreateBalance(
    em: EntityManager,
    walletId: string,
    currency: Currency,
  ): Promise<WalletBalance> {
    let balance = await em
      .getRepository(WalletBalance)
      .findOne({ where: { walletId, currency } });

    if (!balance) {
      balance = await em.getRepository(WalletBalance).save(
        em.getRepository(WalletBalance).create({
          walletId,
          currency,
          balance: '0',
          lockedBalance: '0',
        }),
      );
    }
    return balance;
  }
}