// ─── mock-fx.provider.ts ──────────────────────────────────────────────────────
import { Injectable, Logger } from '@nestjs/common';
import { Currency } from '../common/enums';
import { FxRatesResponse } from './fx-rate.interface';

// Static mock rates: 1 NGN = X <currency>
const MOCK_RATES_FROM_NGN: Record<string, number> = {
  [Currency.USD]: 0.00066,
  [Currency.EUR]: 0.00061,
  [Currency.GBP]: 0.00052,
  [Currency.NGN]: 1,
};

@Injectable()
export class MockFxProvider {
  private readonly logger = new Logger(MockFxProvider.name);

  getRates(base: string): FxRatesResponse {
    this.logger.log(`[MOCK] Returning mock FX rates for base ${base}`);
    const baseUpper = base.toUpperCase();
    const rates: Record<string, number> = {};

    for (const target of Object.values(Currency)) {
      if (target === baseUpper) continue;
      const baseInNgn = 1 / (MOCK_RATES_FROM_NGN[baseUpper] ?? 1);
      rates[target] = parseFloat(
        ((MOCK_RATES_FROM_NGN[target] ?? 1) * baseInNgn).toFixed(10),
      );
    }

    return {
      base: baseUpper,
      timestamp: new Date().toISOString(),
      rates,
    };
  }
}