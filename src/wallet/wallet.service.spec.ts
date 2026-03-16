import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { WalletService } from './wallet.service';
import { FxService } from '../fx/fx.service';
import { Wallet, WalletBalance, LedgerEntry, Transaction, User } from '../entities';
import { Currency, TransactionType, LedgerEntryType } from '../common/enums';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeWallet = (id = 'wallet-1', userId = 'user-1'): Wallet =>
  ({ id, userId, balances: [], ledgerEntries: [], createdAt: new Date() } as any);

const makeBalance = (currency: Currency, balance: string, id?: string): WalletBalance =>
  ({ id: id ?? `bal-${currency}`, walletId: 'wallet-1', currency, balance, lockedBalance: '0', updatedAt: new Date() } as any);

const makeFx = (rate = 0.00066) => ({
  getRate: jest.fn().mockResolvedValue(new Decimal(rate)),
});

/**
 * Builds an EntityManager where each entity class has its own isolated repo mock.
 * Pass a map of entity → partial repo overrides.
 */
function buildEm(entityMocks: Record<string, any> = {}): EntityManager {
  const makeRepo = (overrides: any = {}) => {
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    return {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((d: any) =>
        Promise.resolve(Array.isArray(d) ? d : { id: 'saved-id', ...d }),
      ),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((d: any) => d),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      ...overrides,
    };
  };

  // Each entity class gets its own repo instance
  const repos = new Map<any, any>([
    [Wallet,        makeRepo(entityMocks[Wallet.name])],
    [WalletBalance, makeRepo(entityMocks[WalletBalance.name])],
    [LedgerEntry,   makeRepo(entityMocks[LedgerEntry.name])],
    [Transaction,   makeRepo(entityMocks[Transaction.name])],
    [User,          makeRepo(entityMocks[User.name])],
  ]);

  return {
    getRepository: jest.fn().mockImplementation((entity: any) =>
      repos.get(entity) ?? makeRepo(),
    ),
  } as unknown as EntityManager;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WalletService', () => {
  let service: WalletService;
  let dataSource: jest.Mocked<DataSource>;
  let fxService: ReturnType<typeof makeFx>;

  beforeEach(async () => {
    fxService = makeFx();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: DataSource, useValue: { transaction: jest.fn(), getRepository: jest.fn() } },
        { provide: FxService, useValue: fxService },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    dataSource = module.get(DataSource);
  });

  afterEach(() => jest.clearAllMocks());

  // helper: skip idempotency check (no existing tx)
  const noIdempotency = () => {
    dataSource.getRepository = jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(null),
    });
  };

  // ─── getWallet ────────────────────────────────────────────────────────────

  describe('getWallet', () => {
    it('returns formatted balances', async () => {
      const wallet = { ...makeWallet(), balances: [makeBalance(Currency.NGN, '500000'), makeBalance(Currency.USD, '330.5')] };
      dataSource.getRepository = jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(wallet) });

      const result = await service.getWallet('user-1');

      expect(result.walletId).toBe('wallet-1');
      expect(result.balances.find(b => b.currency === Currency.NGN)?.balance).toBe(500000);
      expect(result.balances.find(b => b.currency === Currency.USD)?.balance).toBe(330.5);
    });

    it('throws NotFoundException when wallet missing', async () => {
      dataSource.getRepository = jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
      await expect(service.getWallet('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── fund ─────────────────────────────────────────────────────────────────

  describe('fund', () => {
    it('adds amount to existing NGN balance correctly', async () => {
      noIdempotency();
      const wallet = makeWallet();
      const balance = makeBalance(Currency.NGN, '1000', 'bal-NGN');
      let updatedBal: string | null = null;

      dataSource.transaction = jest.fn().mockImplementation(async (cb) => {
        const em = buildEm({
          [Wallet.name]: { findOne: jest.fn().mockResolvedValue(wallet) },
          [WalletBalance.name]: {
            findOne: jest.fn().mockResolvedValue(balance),
            update: jest.fn().mockImplementation((_id: any, data: any) => { updatedBal = data.balance; return Promise.resolve({}); }),
          },
        });
        return cb(em);
      });

      const result = await service.fund('user-1', { currency: Currency.NGN, amount: 5000 }) as any;

      expect(result.newBalance).toBe(6000);
      expect(updatedBal).toBe('6000.000000');
    });

    it('returns idempotent result on duplicate key', async () => {
      dataSource.getRepository = jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue({ id: 'tx-1', reference: 'ref-abc' }),
      });

      const result = await service.fund('user-1', {
        currency: Currency.NGN, amount: 1000, idempotencyKey: 'key-123',
      }) as any;

      expect(result.idempotent).toBe(true);
      expect(result.reference).toBe('ref-abc');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when wallet missing', async () => {
      noIdempotency();
      dataSource.transaction = jest.fn().mockImplementation(async (cb) => {
        const em = buildEm({ [Wallet.name]: { findOne: jest.fn().mockResolvedValue(null) } });
        return cb(em);
      });
      await expect(service.fund('user-1', { currency: Currency.NGN, amount: 100 })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── convert ──────────────────────────────────────────────────────────────

  describe('convert', () => {
    it('throws BadRequestException for same currency', async () => {
      await expect(
        service.convert('user-1', { fromCurrency: Currency.NGN, toCurrency: Currency.NGN, amount: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for unsupported pair', async () => {
      noIdempotency();
      fxService.getRate.mockRejectedValueOnce(new BadRequestException('Unsupported pair'));

      dataSource.transaction = jest.fn().mockImplementation(async (cb) => {
        const wallet = makeWallet();
        const em = buildEm({
          [Wallet.name]: { findOne: jest.fn().mockResolvedValue(wallet) },
          [WalletBalance.name]: {
            createQueryBuilder: jest.fn().mockReturnValue({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(makeBalance(Currency.NGN, '999999')),
            }),
          },
        });
        return cb(em);
      });

      await expect(
        service.convert('user-1', { fromCurrency: Currency.NGN, toCurrency: 'JPY' as Currency, amount: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for insufficient balance', async () => {
      noIdempotency();
      dataSource.transaction = jest.fn().mockImplementation(async (cb) => {
        const em = buildEm({
          [Wallet.name]: { findOne: jest.fn().mockResolvedValue(makeWallet()) },
          [WalletBalance.name]: {
            createQueryBuilder: jest.fn().mockReturnValue({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(makeBalance(Currency.NGN, '100')),
            }),
          },
        });
        return cb(em);
      });

      await expect(
        service.convert('user-1', { fromCurrency: Currency.NGN, toCurrency: Currency.USD, amount: 5000 }),
      ).rejects.toThrow(/Insufficient balance/);
    });

    it('converts NGN → USD correctly at live rate', async () => {
      fxService.getRate.mockResolvedValue(new Decimal('0.00066'));
      noIdempotency();

      const wallet = makeWallet();
      const ngnBalance = makeBalance(Currency.NGN, '500000', 'bal-NGN');

      dataSource.transaction = jest.fn().mockImplementation(async (cb) => {
        const em = buildEm({
          [Wallet.name]: { findOne: jest.fn().mockResolvedValue(wallet) },
          [WalletBalance.name]: {
            // getOne (FOR UPDATE lock) → ngnBalance; findOne (getOrCreateBalance) → null (creates USD bal)
            createQueryBuilder: jest.fn().mockReturnValue({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(ngnBalance),
            }),
            findOne: jest.fn().mockResolvedValue(null),
            // save returns object with balance='0' so Decimal can parse it
            save: jest.fn().mockResolvedValue({ id: 'bal-USD', walletId: 'wallet-1', currency: Currency.USD, balance: '0', lockedBalance: '0' }),
          },
        });
        return cb(em);
      });

      const result = await service.convert('user-1', {
        fromCurrency: Currency.NGN, toCurrency: Currency.USD, amount: 500000,
      }) as any;

      expect(result.from.currency).toBe(Currency.NGN);
      expect(result.from.amount).toBe(500000);
      expect(result.to.currency).toBe(Currency.USD);
      expect(result.to.amount).toBeCloseTo(330, 0);
      expect(result.rate).toBe(0.00066);
      expect(result.rateTimestamp).toBeDefined();
    });

    it('converts EUR → NGN correctly', async () => {
      fxService.getRate.mockResolvedValue(new Decimal('1639.344'));
      noIdempotency();

      dataSource.transaction = jest.fn().mockImplementation(async (cb) => {
        const em = buildEm({
          [Wallet.name]: { findOne: jest.fn().mockResolvedValue(makeWallet()) },
          [WalletBalance.name]: {
            createQueryBuilder: jest.fn().mockReturnValue({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(makeBalance(Currency.EUR, '50')),
            }),
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockResolvedValue({ id: 'bal-NGN', walletId: 'wallet-1', currency: Currency.NGN, balance: '0', lockedBalance: '0' }),
          },
        });
        return cb(em);
      });

      const result = await service.convert('user-1', {
        fromCurrency: Currency.EUR, toCurrency: Currency.NGN, amount: 50,
      }) as any;

      expect(result.to.currency).toBe(Currency.NGN);
      expect(result.to.amount).toBeCloseTo(81967.2, 0);
    });

    it('creates immutable paired ledger entries with shared reference and rate', async () => {
      fxService.getRate.mockResolvedValue(new Decimal('0.00066'));
      noIdempotency();
      let ledgerEntries: any[] = [];

      dataSource.transaction = jest.fn().mockImplementation(async (cb) => {
        const em = buildEm({
          [Wallet.name]: { findOne: jest.fn().mockResolvedValue(makeWallet()) },
          [WalletBalance.name]: {
            createQueryBuilder: jest.fn().mockReturnValue({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(makeBalance(Currency.NGN, '100000')),
            }),
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockResolvedValue({ id: 'bal-USD', balance: '0', currency: Currency.USD, walletId: 'wallet-1', lockedBalance: '0' }),
          },
          [LedgerEntry.name]: {
            save: jest.fn().mockImplementation((data: any) => { ledgerEntries = data; return Promise.resolve(data); }),
          },
        });
        return cb(em);
      });

      await service.convert('user-1', { fromCurrency: Currency.NGN, toCurrency: Currency.USD, amount: 10000 });

      expect(ledgerEntries).toHaveLength(2);
      const ngnEntry = ledgerEntries.find((e: any) => e.currency === Currency.NGN);
      const usdEntry = ledgerEntries.find((e: any) => e.currency === Currency.USD);
      expect(parseFloat(ngnEntry.amount)).toBe(-10000);
      expect(parseFloat(usdEntry.amount)).toBeCloseTo(6.6, 1);
      expect(ngnEntry.entryType).toBe(LedgerEntryType.CONVERT);
      expect(usdEntry.entryType).toBe(LedgerEntryType.CONVERT);
      expect(ngnEntry.reference).toBe(usdEntry.reference);
      expect(ngnEntry.rate).toBe(usdEntry.rate);
    });

    it('stores rateTimestamp on ledger entries and transaction record', async () => {
      fxService.getRate.mockResolvedValue(new Decimal('0.00066'));
      noIdempotency();
      let savedTx: any = null;
      let ledgerEntries: any[] = [];

      dataSource.transaction = jest.fn().mockImplementation(async (cb) => {
        const em = buildEm({
          [Wallet.name]: { findOne: jest.fn().mockResolvedValue(makeWallet()) },
          [WalletBalance.name]: {
            createQueryBuilder: jest.fn().mockReturnValue({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(makeBalance(Currency.NGN, '50000')),
            }),
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockResolvedValue({ id: 'bal-USD', balance: '0', currency: Currency.USD, walletId: 'wallet-1', lockedBalance: '0' }),
          },
          [LedgerEntry.name]: {
            save: jest.fn().mockImplementation((data: any) => { ledgerEntries = data; return Promise.resolve(data); }),
          },
          [Transaction.name]: {
            save: jest.fn().mockImplementation((data: any) => { savedTx = data; return Promise.resolve(data); }),
          },
        });
        return cb(em);
      });

      const before = new Date();
      await service.convert('user-1', { fromCurrency: Currency.NGN, toCurrency: Currency.USD, amount: 1000 });
      const after = new Date();

      expect(savedTx?.rateTimestamp).toBeDefined();
      const ts = new Date(savedTx.rateTimestamp).getTime();
      expect(ts).toBeGreaterThanOrEqual(before.getTime());
      expect(ts).toBeLessThanOrEqual(after.getTime());
      ledgerEntries.forEach((e: any) => expect(e.rateTimestamp).toBeDefined());
    });
  });

  // ─── trade ────────────────────────────────────────────────────────────────

  describe('trade', () => {
    it('throws BadRequestException for same currency', async () => {
      await expect(
        service.trade('user-1', { fromCurrency: Currency.USD, toCurrency: Currency.USD, amount: 100, orderType: 'MARKET' as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('records TRADE type and MARKET orderType', async () => {
      fxService.getRate.mockResolvedValue(new Decimal('0.00066'));
      noIdempotency();
      let savedTx: any = null;

      dataSource.transaction = jest.fn().mockImplementation(async (cb) => {
        const em = buildEm({
          [Wallet.name]: { findOne: jest.fn().mockResolvedValue(makeWallet()) },
          [WalletBalance.name]: {
            createQueryBuilder: jest.fn().mockReturnValue({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(makeBalance(Currency.NGN, '100000')),
            }),
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockResolvedValue({ id: 'bal-USD', balance: '0', currency: Currency.USD, walletId: 'wallet-1', lockedBalance: '0' }),
          },
          [Transaction.name]: {
            save: jest.fn().mockImplementation((data: any) => { savedTx = data; return Promise.resolve(data); }),
          },
        });
        return cb(em);
      });

      await service.trade('user-1', { fromCurrency: Currency.NGN, toCurrency: Currency.USD, amount: 10000, orderType: 'MARKET' as any });

      expect(savedTx?.type).toBe(TransactionType.TRADE);
      expect(savedTx?.metadata?.orderType).toBe('MARKET');
    });
  });

  // ─── transfer ─────────────────────────────────────────────────────────────

  describe('transfer', () => {
    it('throws BadRequestException for self-transfer', async () => {
      noIdempotency();
      dataSource.transaction = jest.fn().mockImplementation(async (cb) => {
        const em = buildEm({
          [User.name]: { findOne: jest.fn().mockResolvedValue({ id: 'user-1', email: 'me@x.com', isVerified: true }) },
        });
        return cb(em);
      });

      await expect(
        service.transfer('user-1', { recipientEmail: 'me@x.com', currency: Currency.NGN, amount: 100 }),
      ).rejects.toThrow(/Cannot transfer to yourself/);
    });

    it('throws BadRequestException for insufficient balance', async () => {
      noIdempotency();
      dataSource.transaction = jest.fn().mockImplementation(async (cb) => {
        const walletFindOne = jest.fn()
          .mockResolvedValueOnce(makeWallet('wallet-s', 'user-s'))
          .mockResolvedValueOnce(makeWallet('wallet-r', 'user-r'));

        const em = buildEm({
          [User.name]: { findOne: jest.fn().mockResolvedValue({ id: 'user-r', email: 'r@x.com', isVerified: true }) },
          [Wallet.name]: { findOne: walletFindOne },
          [WalletBalance.name]: {
            createQueryBuilder: jest.fn().mockReturnValue({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(makeBalance(Currency.NGN, '500')),
            }),
          },
        });
        return cb(em);
      });

      await expect(
        service.transfer('user-s', { recipientEmail: 'r@x.com', currency: Currency.NGN, amount: 1000 }),
      ).rejects.toThrow(/Insufficient balance/);
    });

    it('throws NotFoundException when recipient missing', async () => {
      noIdempotency();
      dataSource.transaction = jest.fn().mockImplementation(async (cb) => {
        const em = buildEm({ [User.name]: { findOne: jest.fn().mockResolvedValue(null) } });
        return cb(em);
      });

      await expect(
        service.transfer('user-1', { recipientEmail: 'ghost@x.com', currency: Currency.NGN, amount: 100 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Decimal precision ────────────────────────────────────────────────────

  describe('decimal precision', () => {
    it('handles large NGN amounts without floating point errors', () => {
      expect(new Decimal('10000000').times('0.00066').toFixed(6)).toBe('6600.000000');
    });

    it('handles micro amounts correctly', () => {
      expect(new Decimal('1').times('0.00066').toFixed(6)).toBe('0.000660');
    });

    it('negated amount produces correct debit entry', () => {
      expect(new Decimal('500000').negated().toFixed(6)).toBe('-500000.000000');
    });

    it('balance addition does not drift at precision boundary', () => {
      expect(new Decimal('999999.999999').plus('0.000001').toFixed(6)).toBe('1000000.000000');
    });
  });
});