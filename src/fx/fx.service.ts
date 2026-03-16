// ─── fx.service.ts ────────────────────────────────────────────────────────────
import { Injectable, Logger, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { Redis } from 'ioredis';
import { InjectRedis } from '../common/redis/redis.decorator';
import { MockFxProvider } from './mock-fx.provider';
import { Currency } from '../common/enums';

const SUPPORTED = Object.values(Currency);

// Supported FX pairs — both directions must be listed
export const SUPPORTED_PAIRS: Record<string, string[]> = {
  [Currency.NGN]: [Currency.USD, Currency.EUR, Currency.GBP],
  [Currency.USD]: [Currency.NGN, Currency.EUR, Currency.GBP],
  [Currency.EUR]: [Currency.NGN, Currency.USD, Currency.GBP],
  [Currency.GBP]: [Currency.NGN, Currency.USD, Currency.EUR],
};

export function validateFxPair(from: Currency, to: Currency): void {
  if (!SUPPORTED_PAIRS[from]?.includes(to)) {
    throw new BadRequestException(
      `Conversion from ${from} → ${to} is not supported. Supported pairs for ${from}: ${SUPPORTED_PAIRS[from]?.join(', ')}`,
    );
  }
}

@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);

  constructor(
    private cfg: ConfigService,
    private mockProvider: MockFxProvider,
    @InjectRedis() private redis: Redis,
  ) {}

  async getRates(
    base: string = Currency.NGN,
    force = false, // when true, bypass cache and refresh from API
  ): Promise<{ base: string; timestamp: string; rates: Record<string, number> }> {
    const baseUpper = base.toUpperCase();
    const cacheKey = `FX_RATE:${baseUpper}`;
    const ttl = this.cfg.get<number>('fx.cacheTtlSeconds') || 300;
    const apiKey = this.cfg.get<string>('fx.apiKey');

    // 1. Cache hit — skip if force refresh
    if (!force) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache HIT for ${cacheKey}`);
        return JSON.parse(cached);
      }
    }

    // 2. No API key → mock
    if (!apiKey) {
      const mock = this.mockProvider.getRates(baseUpper);
      await this.redis.setex(cacheKey, ttl, JSON.stringify(mock));
      return mock;
    }

    // 3. Call ExchangeRate API
    try {
      const url = `${this.cfg.get('fx.apiBaseUrl')}/v6/${apiKey}/latest/${baseUpper}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API responded ${res.status}`);
      const data = await res.json();
      if (data.result !== 'success') throw new Error(data['error-type']);

      const rates: Record<string, number> = {};
      for (const cur of SUPPORTED) {
        if (cur !== baseUpper && data.conversion_rates[cur]) {
          rates[cur] = data.conversion_rates[cur];
        }
      }

      const result = { base: baseUpper, timestamp: new Date().toISOString(), rates };
      await this.redis.setex(cacheKey, ttl, JSON.stringify(result));
      // Keep a stale copy with no TTL for emergency fallback
      await this.redis.set(`${cacheKey}:stale`, JSON.stringify(result));
      this.logger.log(`FX rates refreshed from API for base ${baseUpper}`);
      return result;
    } catch (err) {
      this.logger.warn(`FX API call failed: ${err.message}. Falling back.`);

      // 4. Stale cache fallback
      const stale = await this.redis.get(`${cacheKey}:stale`);
      if (stale) return JSON.parse(stale);

      // 5. Final fallback: mock
      const mock = this.mockProvider.getRates(baseUpper);
      await this.redis.setex(cacheKey, ttl, JSON.stringify(mock));
      return mock;
    }
  }

  async getRate(from: Currency, to: Currency): Promise<Decimal> {
    if (from === to) return new Decimal(1);
    validateFxPair(from, to); // guard before any DB/API call
    const { rates } = await this.getRates(from);
    const rate = rates[to];
    if (!rate) throw new ServiceUnavailableException(`No FX rate available for ${from}→${to}`);
    return new Decimal(rate);
  }
}