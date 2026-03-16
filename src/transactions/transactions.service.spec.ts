import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransactionsService } from './transactions.service';
import { Transaction } from '../entities';
import { Currency, TransactionType, TransactionStatus } from '../common/enums';

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-' + Math.random().toString(36).slice(2),
  userId: 'user-1',
  reference: 'ref-' + Math.random().toString(36).slice(2),
  type: TransactionType.FUND,
  status: TransactionStatus.SUCCESS,
  fromCurrency: Currency.NGN,
  toCurrency: null,
  amount: '10000',
  convertedAmount: null,
  rate: null,
  rateTimestamp: null,
  idempotencyKey: null,
  metadata: {},
  createdAt: new Date(),
  user: null,
  ...overrides,
} as any);

describe('TransactionsService', () => {
  let service: TransactionsService;
  let mockRepo: any;

  beforeEach(async () => {
    mockRepo = {
      createQueryBuilder: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Transaction), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  afterEach(() => jest.clearAllMocks());

  function buildQb(transactions: Transaction[], total = transactions.length) {
    mockRepo.count.mockResolvedValue(total);
    const qb = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(transactions),
    };
    mockRepo.createQueryBuilder.mockReturnValue(qb);
    return qb;
  }

  // ─── Basic retrieval ────────────────────────────────────────────────────────

  describe('findByUser', () => {
    it('returns empty data with hasMore=false when no transactions', async () => {
      buildQb([]);

      const result = await service.findByUser('user-1', { limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
      expect(result.meta.total).toBe(0);
    });

    it('maps transaction fields correctly', async () => {
      const tx = makeTx({
        type: TransactionType.CONVERT,
        fromCurrency: Currency.NGN,
        toCurrency: Currency.USD,
        amount: '500000',
        convertedAmount: '330',
        rate: '0.00066',
        rateTimestamp: new Date('2026-03-16T10:00:00Z'),
        status: TransactionStatus.SUCCESS,
      });
      buildQb([tx]);

      const result = await service.findByUser('user-1', { limit: 20 });

      expect(result.data[0].type).toBe(TransactionType.CONVERT);
      expect(result.data[0].fromCurrency).toBe(Currency.NGN);
      expect(result.data[0].toCurrency).toBe(Currency.USD);
      expect(result.data[0].amount).toBe(500000);
      expect(result.data[0].convertedAmount).toBe(330);
      expect(result.data[0].rate).toBe(0.00066);
      expect(result.data[0].rateTimestamp).toBeDefined();
      expect(result.data[0].status).toBe(TransactionStatus.SUCCESS);
    });

    it('returns null for toCurrency and rate on FUND transactions', async () => {
      const tx = makeTx({ type: TransactionType.FUND, toCurrency: null, rate: null });
      buildQb([tx]);

      const result = await service.findByUser('user-1', { limit: 20 });

      expect(result.data[0].toCurrency).toBeNull();
      expect(result.data[0].rate).toBeNull();
      expect(result.data[0].convertedAmount).toBeNull();
    });
  });

  // ─── Cursor pagination ──────────────────────────────────────────────────────

  describe('cursor pagination', () => {
    it('sets hasMore=true and provides nextCursor when more records exist', async () => {
      // limit=2, fetch limit+1=3, return 3 → hasMore=true
      const txs = [makeTx(), makeTx(), makeTx()];
      buildQb(txs, 10);

      const result = await service.findByUser('user-1', { limit: 2 });

      expect(result.data).toHaveLength(2); // sliced to limit
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.nextCursor).toBeTruthy();
      expect(typeof result.meta.nextCursor).toBe('string');
    });

    it('sets hasMore=false when on last page', async () => {
      // limit=20, only 5 records returned (≤ limit)
      const txs = Array.from({ length: 5 }, () => makeTx());
      buildQb(txs, 5);

      const result = await service.findByUser('user-1', { limit: 20 });

      expect(result.data).toHaveLength(5);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
    });

    it('nextCursor is valid base64 containing createdAt and id', async () => {
      const tx = makeTx({ createdAt: new Date('2026-03-16T10:00:00Z'), id: 'tx-abc' });
      buildQb([tx, makeTx()], 10); // 2 returned for limit=1

      const result = await service.findByUser('user-1', { limit: 1 });

      const decoded = JSON.parse(Buffer.from(result.meta.nextCursor!, 'base64').toString());
      expect(decoded).toHaveProperty('createdAt');
      expect(decoded).toHaveProperty('id');
    });

    it('applies cursor filter on subsequent pages', async () => {
      const txs = [makeTx()];
      const qb = buildQb(txs, 5);

      const cursor = Buffer.from(JSON.stringify({
        createdAt: '2026-03-16T10:00:00.000Z',
        id: 'tx-prev',
      })).toString('base64');

      await service.findByUser('user-1', { cursor, limit: 10 });

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('createdAt'),
        expect.objectContaining({ createdAt: expect.any(String), id: 'tx-prev' }),
      );
    });

    it('respects limit cap of 100', async () => {
      const txs = [makeTx()];
      const qb = buildQb(txs, 1);

      await service.findByUser('user-1', { limit: 500 }); // over cap

      // take() should be called with 101 (100 + 1 for hasMore detection)
      expect(qb.take).toHaveBeenCalledWith(101);
    });

    it('defaults to limit=20 when not specified', async () => {
      const txs = [makeTx()];
      const qb = buildQb(txs, 1);

      await service.findByUser('user-1', {});

      expect(qb.take).toHaveBeenCalledWith(21); // 20 + 1
    });

    it('includes total count in meta', async () => {
      buildQb([makeTx(), makeTx()], 42);

      const result = await service.findByUser('user-1', { limit: 20 });

      expect(result.meta.total).toBe(42);
    });
  });

  // ─── Transaction types ───────────────────────────────────────────────────────

  describe('transaction type coverage', () => {
    const types = [
      TransactionType.FUND,
      TransactionType.CONVERT,
      TransactionType.TRADE,
      TransactionType.TRANSFER_IN,
      TransactionType.TRANSFER_OUT,
    ];

    types.forEach(type => {
      it(`correctly returns ${type} transaction`, async () => {
        buildQb([makeTx({ type })]);
        const result = await service.findByUser('user-1', { limit: 20 });
        expect(result.data[0].type).toBe(type);
      });
    });
  });
});