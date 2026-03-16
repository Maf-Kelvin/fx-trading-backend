
// ─── index.ts ───────────────────────────────────────────────────────
export enum Currency {
  NGN = 'NGN',
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
}

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export enum TransactionType {
  FUND = 'FUND',
  CONVERT = 'CONVERT',
  TRADE = 'TRADE',
  TRANSFER_OUT = 'TRANSFER_OUT',
  TRANSFER_IN = 'TRANSFER_IN',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum LedgerEntryType {
  FUND = 'FUND',
  CONVERT = 'CONVERT',
  TRADE = 'TRADE',
  TRANSFER_OUT = 'TRANSFER_OUT',
  TRANSFER_IN = 'TRANSFER_IN',
}

export enum OrderType {
  MARKET = 'MARKET',
}