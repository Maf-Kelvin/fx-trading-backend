// ─── fx-rate.interface.ts ─────────────────────────────────────────────────────
export interface FxRatesResponse {
  base: string;
  timestamp: string;
  rates: Record<string, number>;
}






