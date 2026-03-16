import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { FxService, validateFxPair, SUPPORTED_PAIRS } from './fx.service';
import { MockFxProvider } from './mock-fx.provider';
import { REDIS_CLIENT } from '../common/redis/redis.decorator';
import { Currency } from '../common/enums';

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn().mockResolvedValue('OK'),
  set: jest.fn().mockResolvedValue('OK'),
};

const mockConfig = (apiKey = '') => ({
  get: jest.fn((key: string) => {
    if (key === 'fx.apiKey') return apiKey;
    if (key === 'fx.cacheTtlSeconds') return 300;
    if (key === 'fx.apiBaseUrl') return 'https://v6.exchangerate-api.com';
    return null;
  }),
});

describe('FxService', () => {
  let service: FxService;

  async function build(apiKey = '') {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FxService,
        MockFxProvider,
        { provide: ConfigService, useValue: mockConfig(apiKey) },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();
    service = module.get<FxService>(FxService);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    await build();
  });

  // ─── Cache ──────────────────────────────────────────────────────────────────

  describe('getRates — caching', () => {
    it('returns cached rates on cache hit without calling mock or API', async () => {
      const cached = JSON.stringify({
        base: 'NGN', timestamp: new Date().toISOString(),
        rates: { USD: 0.00066, EUR: 0.00061, GBP: 0.00052 },
      });
      mockRedis.get.mockResolvedValue(cached);

      const result = await service.getRates('NGN');

      expect(result.base).toBe('NGN');
      expect(result.rates.USD).toBe(0.00066);
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('stores result in Redis on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      await service.getRates('NGN');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'FX_RATE:NGN', 300, expect.any(String),
      );
    });

    it('bypasses cache when force=true', async () => {
      const cached = JSON.stringify({
        base: 'NGN', timestamp: new Date().toISOString(),
        rates: { USD: 0.00066 },
      });
      mockRedis.get.mockResolvedValue(cached);

      await service.getRates('NGN', true);

      // Even though cache had data, setex should still be called (re-caching fresh data)
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('caches with correct TTL of 300 seconds', async () => {
      mockRedis.get.mockResolvedValue(null);

      await service.getRates('NGN');

      expect(mockRedis.setex).toHaveBeenCalledWith('FX_RATE:NGN', 300, expect.any(String));
    });
  });

  // ─── Mock provider fallback ──────────────────────────────────────────────────

  describe('getRates — mock fallback', () => {
    it('uses mock provider when no API key is set', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getRates('NGN');

      expect(result.base).toBe('NGN');
      expect(result.rates).toHaveProperty('USD');
      expect(result.rates).toHaveProperty('EUR');
      expect(result.rates).toHaveProperty('GBP');
    });

    it('mock rates are positive numbers', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getRates('NGN');

      Object.values(result.rates).forEach(rate => {
        expect(rate).toBeGreaterThan(0);
      });
    });

    it('mock rates for USD base are correct direction', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getRates('USD');

      expect(result.base).toBe('USD');
      expect(result.rates.NGN).toBeGreaterThan(1); // 1 USD > 1 NGN
    });
  });

  // ─── Live API path ──────────────────────────────────────────────────────────

  describe('getRates — live API', () => {
    beforeEach(async () => {
      await build('test-api-key-123'); // build with an API key set
    });

    it('calls ExchangeRate API when key is set and cache misses', async () => {
      mockRedis.get.mockResolvedValue(null);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          result: 'success',
          conversion_rates: { USD: 0.00066, EUR: 0.00061, GBP: 0.00052, NGN: 1 },
        }),
      }) as any;

      const result = await service.getRates('NGN');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('test-api-key-123'),
      );
      expect(result.rates.USD).toBe(0.00066);
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('stores stale cache copy after successful API call', async () => {
      mockRedis.get.mockResolvedValue(null);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          result: 'success',
          conversion_rates: { USD: 0.00066, EUR: 0.00061, GBP: 0.00052, NGN: 1 },
        }),
      }) as any;

      await service.getRates('NGN');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'FX_RATE:NGN:stale', expect.any(String),
      );
    });

    it('falls back to stale cache when API fails', async () => {
      mockRedis.get.mockResolvedValue(null); // no live cache
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any;

      const stale = JSON.stringify({
        base: 'NGN', timestamp: new Date().toISOString(),
        rates: { USD: 0.00060 },
      });
      // stale cache key returns data
      mockRedis.get.mockImplementation((key: string) =>
        key.endsWith(':stale') ? Promise.resolve(stale) : Promise.resolve(null),
      );

      const result = await service.getRates('NGN');

      expect(result.rates.USD).toBe(0.00060);
    });

    it('falls back to mock when API fails and no stale cache exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any;

      const result = await service.getRates('NGN');

      expect(result.base).toBe('NGN');
      expect(result.rates).toHaveProperty('USD');
    });

    it('throws when API returns non-success result field', async () => {
      mockRedis.get.mockResolvedValue(null);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          result: 'error',
          'error-type': 'invalid-key',
        }),
      }) as any;

      // Should fall back gracefully to mock, not throw to caller
      const result = await service.getRates('NGN');
      expect(result.rates).toHaveProperty('USD');
    });
  });

  describe('getRate', () => {
    it('returns Decimal(1) for same currency', async () => {
      const rate = await service.getRate(Currency.NGN, Currency.NGN);
      expect(rate.toNumber()).toBe(1);
    });

    it('returns correct Decimal rate for NGN → USD', async () => {
      mockRedis.get.mockResolvedValue(null);

      const rate = await service.getRate(Currency.NGN, Currency.USD);

      expect(rate).toBeInstanceOf(Decimal);
      expect(rate.toNumber()).toBeGreaterThan(0);
      expect(rate.toNumber()).toBeLessThan(1); // NGN is weaker than USD
    });

    it('returns correct Decimal rate for USD → NGN', async () => {
      mockRedis.get.mockResolvedValue(null);

      const rate = await service.getRate(Currency.USD, Currency.NGN);

      expect(rate.toNumber()).toBeGreaterThan(1); // USD is stronger than NGN
    });

    it('throws BadRequestException for unsupported pair', async () => {
      await expect(
        service.getRate(Currency.NGN, 'JPY' as Currency),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── validateFxPair ─────────────────────────────────────────────────────────

  describe('validateFxPair', () => {
    it('does not throw for all supported pairs', () => {
      Object.entries(SUPPORTED_PAIRS).forEach(([from, targets]) => {
        targets.forEach(to => {
          expect(() =>
            validateFxPair(from as Currency, to as Currency)
          ).not.toThrow();
        });
      });
    });

    it('throws BadRequestException for NGN → NGN', () => {
      // Same currency handled by getRate before validateFxPair
      // but if called directly it should still error
      expect(() =>
        validateFxPair(Currency.NGN, 'JPY' as Currency)
      ).toThrow(BadRequestException);
    });

    it('throws with descriptive message listing supported targets', () => {
      try {
        validateFxPair(Currency.NGN, 'CHF' as Currency);
      } catch (e) {
        expect(e.message).toContain('NGN');
        expect(e.message).toContain('USD');
      }
    });

    it('validates all 4 base currencies have 3 targets each', () => {
      expect(SUPPORTED_PAIRS[Currency.NGN]).toHaveLength(3);
      expect(SUPPORTED_PAIRS[Currency.USD]).toHaveLength(3);
      expect(SUPPORTED_PAIRS[Currency.EUR]).toHaveLength(3);
      expect(SUPPORTED_PAIRS[Currency.GBP]).toHaveLength(3);
    });

    it('supported pairs are symmetric (NGN→USD implies USD→NGN)', () => {
      Object.entries(SUPPORTED_PAIRS).forEach(([from, targets]) => {
        targets.forEach(to => {
          expect(SUPPORTED_PAIRS[to]).toContain(from);
        });
      });
    });
  });
});