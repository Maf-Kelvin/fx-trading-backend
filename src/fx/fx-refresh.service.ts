// ─── fx-refresh.service.ts ───────────────────────────────────────────────────────
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { FxService } from './fx.service';
import { Currency } from '../common/enums';

const ALL_BASES = Object.values(Currency);

@Injectable()
export class FxRefreshService {
  private readonly logger = new Logger(FxRefreshService.name);

  constructor(private fxService: FxService) {}

  @Interval(60_000) // every 60 seconds
  async refreshRates() {
    this.logger.log('Background FX rate refresh started');
    let success = 0;
    let failed = 0;

    for (const base of ALL_BASES) {
      try {
        await this.fxService.getRates(base, true); // force = true bypasses cache
        success++;
      } catch (err) {
        this.logger.warn(`FX refresh failed for base ${base}: ${err.message}`);
        failed++;
      }
    }

    this.logger.log(`FX refresh complete — ${success} succeeded, ${failed} failed`);
  }
}