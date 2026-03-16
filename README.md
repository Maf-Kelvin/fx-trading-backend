# FX Trading Backend

A production-grade multi-currency FX trading API built with **NestJS**, **PostgreSQL**, and **Redis**.

Users can register, fund wallets, and trade NGN against USD, EUR, and GBP using real-time exchange rates.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Architecture Decisions](#architecture-decisions)
- [Key Assumptions](#key-assumptions)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 10 |
| Database | PostgreSQL 15 (TypeORM) |
| Cache | Redis 7 (ioredis) |
| Auth | JWT (passport-jwt) |
| Financial precision | decimal.js |
| Email | @nestjs-modules/mailer + Nodemailer (SMTP) |
| API Docs | Swagger (OpenAPI 3) |
| `@nestjs/terminus` | Health check endpoint |
| `@nestjs/throttler` | Rate limiting on auth endpoints |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Docker + Docker Compose

### 1. Clone and install

```bash
git clone <your-repo-url>
cd fx-trading-backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values. At minimum, set your DB credentials and JWT secret. Everything else has safe defaults for local development.

> **FX rates**: Leave `FX_API_KEY` empty to run with mock rates — no external API needed locally.

### 3. Start infrastructure

```bash
docker-compose up -d
```

This starts PostgreSQL on port `5432` and Redis on port `6379`.

### 4. Run the app

```bash
# Development (with hot reload)
npm run start:dev

# Production
npm run build && npm run start:prod
```

### 5. Open Swagger

```
http://localhost:3000/api/docs
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP port |
| `NODE_ENV` | No | `development` | Environment (`development` / `production`) |
| `DB_HOST` | No | `localhost` | PostgreSQL host |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_USERNAME` | No | `postgres` | DB username |
| `DB_PASSWORD` | No | `postgres` | DB password |
| `DB_NAME` | No | `fx_trading` | Database name |
| `REDIS_HOST` | No | `localhost` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |
| `JWT_SECRET` | **Yes** | — | JWT signing secret (change in production) |
| `JWT_EXPIRES_IN` | No | `3600s` | JWT TTL |
| `FX_API_KEY` | No | _(empty)_ | ExchangeRate API key. Empty = mock provider |
| `FX_API_BASE_URL` | No | `https://v6.exchangerate-api.com` | FX API base URL |
| `FX_CACHE_TTL_SECONDS` | No | `300` | Redis TTL for FX rates (5 minutes) |
| `SMTP_HOST` | No | `smtp.gmail.com` | SMTP host |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP app password |
| `MAIL_FROM` | No | `noreply@fxtrading.com` | Sender address |
| `INITIAL_NGN_BALANCE` | No | `0` | NGN balance seeded on wallet creation |

---

## API Documentation

Full interactive docs are available at `/api/docs` when the server is running.

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register with email + password. Sends OTP. |
| POST | `/auth/verify` | Public | Verify OTP. Creates wallet on success. |
| POST | `/auth/login` | Public | Login. Returns JWT. |

**Register**
```json
POST /auth/register
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Verify OTP**
```json
POST /auth/verify
{
  "email": "user@example.com",
  "otp": "482193"
}
```

**Login**
```json
POST /auth/login
{
  "email": "user@example.com",
  "password": "securePassword123"
}
// Response:
{
  "accessToken": "eyJ...",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

---

### Wallet

All wallet endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/wallet` | Get all currency balances |
| POST | `/wallet/fund` | Fund wallet in any supported currency |
| POST | `/wallet/convert` | Instant FX swap using real-time rate |
| POST | `/wallet/trade` | Market order trade (with future expansion support) |

**Fund wallet**
```json
POST /wallet/fund
{
  "currency": "NGN",
  "amount": 50000
}
```

**Convert 1000 NGN → USD**
```json
POST /wallet/convert
{
  "fromCurrency": "NGN",
  "toCurrency": "USD",
  "amount": 1000
}
// Response:
{
  "message": "convert executed successfully",
  "reference": "uuid",
  "from": { "currency": "NGN", "amount": 1000 },
  "to": { "currency": "USD", "amount": 0.66 },
  "rate": 0.00066
}
```

**Trade (market order)**
```json
POST /wallet/trade
{
  "fromCurrency": "EUR",
  "toCurrency": "NGN",
  "amount": 50,
  "orderType": "MARKET"
}
```

---

### FX Rates

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/fx/rates` | **Public** | Get current rates for all supported pairs |

```
GET /fx/rates?base=NGN

{
  "base": "NGN",
  "timestamp": "2026-03-16T10:00:00Z",
  "rates": {
    "USD": 0.00066,
    "EUR": 0.00061,
    "GBP": 0.00052
  }
}
```

---

### Transactions

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/transactions` | Bearer | Full transaction history |

---

## Architecture Decisions

### Ledger-based wallet accounting

Rather than a single `balance` column that gets mutated on every operation, every movement of money creates an immutable `ledger_entry` record. The `wallet_balances` table is a cached aggregate — it can always be fully reconstructed by summing ledger entries. This mirrors how Stripe, Paystack, and Flutterwave handle financial state.

### Row-level locking (`SELECT ... FOR UPDATE`)

All convert and trade operations acquire a pessimistic write lock on the `wallet_balance` rows before reading balances. This prevents two concurrent requests from both reading the same balance, both seeing sufficient funds, and both spending it — the classic double-spend race condition.

### Atomic DB transactions

Every financial operation (fund, convert, trade) wraps all database writes — balance update, ledger entries, transaction record — in a single PostgreSQL transaction. If any step fails, everything rolls back. The database is never left in a partial state.

### FX rate resolution chain

```
Request arrives
    ↓
Redis cache hit? → return immediately
    ↓
FX_API_KEY present? → call ExchangeRate API → cache result → return
    ↓
API call fails? → use stale Redis cache if available → return
    ↓
Final fallback: MockFxProvider (deterministic static rates)
```

This means the app is fully functional with no external dependencies for local development, and degrades gracefully in production if the FX API is temporarily unavailable.

### Decimal.js for all financial arithmetic

JavaScript `number` cannot safely represent arbitrary decimal fractions (0.1 + 0.2 ≠ 0.3). All amount calculations use `decimal.js` with 28-digit precision and `ROUND_HALF_UP` rounding. All amounts are stored in PostgreSQL as `DECIMAL(18,6)` — never as floats.

### Lazy currency balance creation

When a user first receives a currency (e.g. via convert), their `wallet_balance` row for that currency is created on the fly inside the same transaction. Only NGN is seeded on wallet creation. This keeps the schema clean and makes it trivial to add new currencies in future.

### Convert vs Trade

Both execute the same underlying exchange logic. The distinction is semantic and contract-based:

- `POST /wallet/convert` — instant swap, no order metadata
- `POST /wallet/trade` — market order with `orderType` field, designed to be extended with limit orders and stop orders in a future trading engine

### TypeORM `synchronize` in development

`synchronize: true` is enabled only when `NODE_ENV !== 'production'`. In production, schema changes must go through explicit TypeORM migrations (`npm run migration:generate` / `npm run migration:run`).

---

## Key Assumptions

1. **Supported currencies are fixed**: NGN, USD, EUR, GBP. Adding a new currency requires adding it to the `Currency` enum — no other code changes needed.

2. **Wallet is created on OTP verification**, not on registration. Unverified users have no wallet and cannot access any protected endpoints.

3. **Funding accepts any supported currency**. The spec says "starting with NGN" which we interpret as NGN being the base/default currency. The implementation allows funding in any supported currency for flexibility (e.g. direct USD funding for testing). The initial seeded balance is always NGN = 0.

4. **SMTP email is optional for local development**. OTP codes are saved to the database regardless of whether email delivery succeeds. Use `POST /auth/dev/otp` (disabled in production) to retrieve the OTP directly during development without needing SMTP configured.

5. **`POST /auth/dev/otp` is a development-only endpoint**. It returns the latest unused OTP for a given email. It throws `400` if `NODE_ENV=production`. Remove or guard this endpoint before going live.

6. **Rates are directional**: `GET /fx/rates?base=NGN` returns how much of each target currency 1 NGN buys. Cross-currency conversions (e.g. USD → EUR) are calculated by fetching the USD-based rates, not by double-converting through NGN.

7. **OTP is 6-digit numeric**, expires in 10 minutes, single-use, max 3 per email per 10 minutes. There is a `POST /auth/resend-otp` endpoint for requesting a new code.

8. **No pagination cursor** — offset-based pagination (`page` + `limit`) is used on `/transactions`. Cursor-based pagination is recommended for production at scale.

9. **`locked_balance` is always 0** in this MVP. The column exists to support reserved funds in a future trading engine (limit orders, pending withdrawals).

10. **Mock FX rates are static** and are meant for local development only. They do not reflect real market rates. Set `FX_API_KEY` in `.env` to use live rates.

---

## Error Responses

All errors follow NestJS's standard format:

```json
{
  "statusCode": 400,
  "message": "Insufficient NGN balance. Available: 500 NGN",
  "error": "Bad Request"
}
```

| Status | Meaning |
|---|---|
| `400` | Validation error, insufficient balance, invalid OTP, same-currency conversion |
| `401` | Invalid credentials, unverified account, missing/expired JWT |
| `404` | Wallet not found |
| `409` | Email already registered |
| `429` | Too many requests (throttle limit hit) |
| `500` | Unexpected server error |

Every response also includes an `X-Request-ID` header for tracing:

```
X-Request-ID: 71d8c4a2-3f1b-4e29-b8a7-2c9f0e1d5a6b
```

---

## Idempotency

Financial endpoints (`/wallet/fund`, `/wallet/convert`, `/wallet/trade`) support an optional `idempotencyKey` field in the request body.

```json
POST /wallet/fund
{
  "currency": "NGN",
  "amount": 10000,
  "idempotencyKey": "8a7f9b2c-1234-5678-abcd-ef0123456789"
}
```

If a request with the same key is retried (e.g. after a network timeout), the original result is returned without re-executing the operation:

```json
{
  "idempotent": true,
  "reference": "original-uuid",
  "message": "Duplicate request — original result returned"
}
```

---

## System Architecture

```
                        ┌─────────────┐
                        │   Client    │
                        │ (Web/Mobile)│
                        └──────┬──────┘
                               │ HTTP + X-Request-ID
                               ▼
                        ┌─────────────┐
                        │  NestJS API │
                        │  :3000      │
                        └──────┬──────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌────────────┐  ┌─────────────┐  ┌────────────┐
       │ Auth       │  │  Wallet     │  │  FX        │
       │ Module     │  │  Service    │  │  Service   │
       │ (JWT+OTP)  │  │ (ledger +   │  │ (rates +   │
       └────────────┘  │  locking)   │  │  cache)    │
                       └──────┬──────┘  └─────┬──────┘
                              │               │
              ┌───────────────┘               │
              ▼                               ▼
       ┌─────────────────┐          ┌─────────────────┐
       │   PostgreSQL    │          │      Redis       │
       │                 │          │                  │
       │ • users         │          │ FX_RATE:NGN_USD  │
       │ • wallets       │          │ FX_RATE:NGN_EUR  │
       │ • wallet_bal.   │          │ (TTL: 5 min)     │
       │ • ledger_entries│          └─────────────────┘
       │ • transactions  │
       └─────────────────┘                ▲
                                          │ cache miss
                                          ▼
                                 ┌─────────────────┐
                                 │  ExchangeRate   │
                                 │  API (external) │
                                 │                 │
                                 │  fallback:      │
                                 │  MockFxProvider │
                                 └─────────────────┘
```

---

```bash
# Run all unit tests
npm test

# With coverage report
npm run test:cov

# Watch mode
npm run test:watch
```

Tests cover:

- `WalletService` — getWallet, fund, convert (same currency guard, insufficient balance, successful conversion)
- `FxService` — cache hit, mock fallback on cache miss, same-currency rate shortcut

---

## Project Structure

```
src/
├── common/
│   ├── enums/            # Currency, TransactionType, etc.
│   └── redis/            # Redis module, provider, decorator
├── config/
│   ├── app.config.ts     # All registerAs() config namespaces
│   └── data-source.ts    # TypeORM DataSource for CLI migrations
├── entities/
│   └── index.ts          # User, Otp, Wallet, WalletBalance, LedgerEntry, Transaction
├── mail/
│   ├── mail.module.ts
│   ├── mail.service.ts
│   └── templates/
│       └── otp.hbs       # Handlebars OTP email template
├── auth/
│   ├── auth.module.ts
│   ├── auth.service.ts   # register, verifyOtp, login
│   ├── auth.controller.ts
│   ├── auth.dto.ts
│   └── jwt.strategy.ts
├── fx/
│   ├── fx.module.ts
│   ├── fx.service.ts     # Rate resolution chain (cache → API → mock)
│   ├── fx.controller.ts
│   ├── fx-rate.interface.ts
│   └── mock-fx.provider.ts
├── wallet/
│   ├── wallet.module.ts
│   ├── wallet.service.ts # fund, convert, trade (atomic + row-level locks)
│   ├── wallet.controller.ts
│   └── wallet.dto.ts
├── transactions/
│   ├── transactions.module.ts
│   ├── transactions.service.ts
│   └── transactions.controller.ts
├── app.module.ts
└── main.ts               # Bootstrap + Swagger setup
```