# FX Trading Backend

A production-grade multi-currency FX trading API built with **NestJS**, **PostgreSQL**, and **Redis**, featuring a full-stack dashboard UI for both users and admins.

Users can register, fund wallets, and trade NGN against USD, EUR, and GBP using real-time exchange rates. Admins can monitor platform activity, users, and transaction volumes.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Admin Setup](#admin-setup)
- [Dashboard UI](#dashboard-ui)
- [API Documentation](#api-documentation)
- [Architecture Decisions](#architecture-decisions)
- [Key Assumptions](#key-assumptions)
- [Error Responses](#error-responses)
- [Idempotency](#idempotency)
- [System Architecture](#system-architecture)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 10 |
| Database | PostgreSQL 15 (TypeORM) |
| Cache | Redis 7 (ioredis) |
| Auth | JWT (passport-jwt) + Role-based access (ADMIN / USER) |
| Financial precision | decimal.js |
| Email | @nestjs-modules/mailer + Nodemailer (SMTP) |
| API Docs | Swagger (OpenAPI 3) |
| Validation | class-validator + class-transformer |
| Rate limiting | @nestjs/throttler |
| Health checks | @nestjs/terminus |
| Dashboard | Plain HTML + CSS + JS (no build step) |

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

Edit `.env` with your values. At minimum set your JWT secret. Everything else has safe defaults for local development.

> **FX rates**: Leave `FX_API_KEY` empty to run with mock rates — no external API needed locally.

> **Email**: Leave SMTP fields empty for local dev. Use `POST /auth/dev/otp` in Swagger to retrieve OTP codes directly.

### 3. Start infrastructure

```bash
docker-compose up -d
```

Starts PostgreSQL on port `5432` and Redis on port `6379`.

### 4. Run the app

```bash
# Development (hot reload)
npm run start:dev

# Production
npm run build && npm run start:prod
```

### 5. Seed admin user

```bash
npm run seed:admin
```

Creates the admin account defined in `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Defaults to `admin@fxtrading.com` / `Admin123`.

### 6. Open Swagger

```
http://localhost:3000/api/docs
```

### 7. Open Dashboards

```
dashboard/user.html    — User dashboard (open directly in browser)
dashboard/admin.html   — Admin dashboard (open directly in browser)
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP port |
| `NODE_ENV` | No | `development` | `development` or `production` |
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
| `ADMIN_EMAIL` | No | `admin@fxtrading.com` | Admin account email (used by seed script) |
| `ADMIN_PASSWORD` | No | `Admin123` | Admin account password (used by seed script) |

---

## Admin Setup

The platform supports two roles: `USER` (default) and `ADMIN`.

Admin accounts are created via the seed script — they are never created through the public registration flow.

```bash
# Create admin from .env credentials
npm run seed:admin
```

Admin endpoints are protected by both JWT auth and a `RolesGuard`. Any non-admin JWT will receive `403 Forbidden`.

---

## Dashboard UI

Two standalone HTML dashboards connect directly to the API at `http://localhost:3000`. No build step required — just open in a browser.

### User Dashboard (`dashboard/user.html`)

| Section | What it does |
|---|---|
| Wallet | Live balance cards for NGN, USD, EUR, GBP |
| Fund Wallet | Fund any currency with a simple form |
| Convert / Trade | Tab switcher — instant convert or market order trade |
| Transactions | Paginated history table with type, rate, status |
| FX Rates | Live rate display for all NGN pairs |

### Admin Dashboard (`dashboard/admin.html`)

| Section | What it does |
|---|---|
| Overview | Platform stats: total users, verified count, transaction volume, daily activity bar charts |
| Users | All users with role, verification status, NGN balance, registration date |
| Transactions | All transactions across all users with pagination |
| FX Rate Monitor | All currency pair rates (NGN, USD, EUR, GBP bases) with refresh button |

> **Admin login**: Use the credentials from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`. The dashboard verifies admin access on login and rejects non-admin accounts.

---

## API Documentation

Full interactive docs at `/api/docs` when the server is running.

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register with email + password. Sends OTP. |
| POST | `/auth/verify` | Public | Verify OTP. Creates wallet on success. |
| POST | `/auth/resend-otp` | Public | Resend OTP to unverified email |
| POST | `/auth/login` | Public | Login. Returns JWT. |
| POST | `/auth/dev/otp` | Public | **[DEV ONLY]** Get latest OTP for email directly — disabled in production |

**Register**
```json
POST /auth/register
{ "email": "user@example.com", "password": "Password123" }
```

**Get OTP (dev)**
```json
POST /auth/dev/otp
{ "email": "user@example.com" }
// Response: { "otp": "482193", "expiresAt": "...", "note": "DEV ONLY" }
```

**Verify OTP**
```json
POST /auth/verify
{ "email": "user@example.com", "otp": "482193" }
```

**Login**
```json
POST /auth/login
{ "email": "user@example.com", "password": "Password123" }
// Response: { "accessToken": "eyJ...", "expiresIn": 3600, "tokenType": "Bearer" }
```

---

### Wallet

All wallet endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/wallet` | Get all currency balances |
| POST | `/wallet/fund` | Fund wallet in any supported currency |
| POST | `/wallet/convert` | Instant FX swap using real-time rate |
| POST | `/wallet/trade` | Market order trade |

**Fund wallet**
```json
POST /wallet/fund
{ "currency": "NGN", "amount": 50000 }
```

**Transfer funds to another user**
```json
POST /wallet/transfer
{ "recipientEmail": "friend@example.com", "currency": "NGN", "amount": 5000 }
// Response:
{
  "message": "Transfer successful",
  "reference": "uuid",
  "to": "friend@example.com",
  "currency": "NGN",
  "amount": 5000
}
```

**Convert 1000 NGN → USD**
```json
POST /wallet/convert
{ "fromCurrency": "NGN", "toCurrency": "USD", "amount": 1000 }
// Response:
{
  "message": "convert executed successfully",
  "reference": "uuid",
  "from": { "currency": "NGN", "amount": 1000 },
  "to": { "currency": "USD", "amount": 0.66 },
  "rate": 0.00066,
  "rateTimestamp": "2026-03-16T10:00:00.000Z"
}
```

**Trade (market order)**
```json
POST /wallet/trade
{ "fromCurrency": "EUR", "toCurrency": "NGN", "amount": 50, "orderType": "MARKET" }
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
  "rates": { "USD": 0.00066, "EUR": 0.00061, "GBP": 0.00052 }
}
```

---

### Transactions

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/transactions` | Bearer | Paginated transaction history |

```
GET /transactions?page=1&limit=20
```

---

### Admin

All admin endpoints require Bearer JWT from an `ADMIN` role account.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/users` | All users with wallet balances and verification status |
| GET | `/admin/transactions` | All transactions across all users |
| GET | `/admin/stats` | Platform stats: user counts, volume by type, daily activity |

---

### Health

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | Public | Database + Redis connectivity check |

---

## Architecture Decisions

### Ledger-based wallet accounting

Every movement of money creates an immutable `ledger_entry` record. The `wallet_balances` table is a cached aggregate that can always be reconstructed by summing ledger entries. This mirrors how Stripe, Paystack, and Flutterwave handle financial state.

### Row-level locking (`SELECT ... FOR UPDATE`)

All convert and trade operations acquire a pessimistic write lock on `wallet_balance` rows before reading balances. This prevents two concurrent requests from both seeing sufficient funds and both spending — the classic double-spend race condition.

### Atomic DB transactions

Every financial operation wraps all database writes — balance update, ledger entries, transaction record — in a single PostgreSQL transaction. If any step fails, everything rolls back.

### Rate snapshot on every transaction

Both the `transactions` and `ledger_entries` tables store `rate` and `rateTimestamp` at the moment of execution. This enables full historical audit replay — you can reconstruct exactly what rate was used and when, independently of the current cache.

### FX rate resolution chain

```
Request arrives
    ↓
Redis cache hit? → return immediately (TTL: 5 min)
    ↓
FX_API_KEY present? → call ExchangeRate API → cache result → return
    ↓
API call fails? → use stale Redis cache if available → return
    ↓
Final fallback: MockFxProvider (deterministic static rates)
```

The app is fully functional with no external dependencies for local development, and degrades gracefully in production if the FX API is temporarily unavailable.

### Decimal.js for all financial arithmetic

All amount calculations use `decimal.js` with 28-digit precision and `ROUND_HALF_UP` rounding. Amounts are stored as `DECIMAL(18,6)` in PostgreSQL — never floats.

### Role-based access control

Two roles: `USER` (default) and `ADMIN`. A `RolesGuard` reads the `role` field from the JWT-authenticated user and enforces access on admin endpoints. Admin accounts are created exclusively via the seed script — never through the public registration flow.

### Idempotency keys

Financial endpoints accept an optional `idempotencyKey` UUID. If a request with the same key is retried, the original result is returned without re-executing the operation. The check only fires when a key is explicitly provided — omitting the key means no duplicate protection, allowing the same operation to be repeated freely.

### Lazy currency balance creation

Only NGN is seeded on wallet creation. Other currency balances are created on first use inside the same transaction. Adding a new currency requires only a `Currency` enum entry.

### Convert vs Trade

Both execute the same underlying exchange logic. The distinction is semantic and forward-looking: `convert` is an instant swap with no order metadata; `trade` records `orderType` (currently `MARKET` only) and is designed to be extended with limit/stop orders in a future trading engine.

---

## Key Assumptions

1. **Supported currencies are fixed**: NGN, USD, EUR, GBP. Adding a new currency requires only adding it to the `Currency` enum.

2. **Wallet is created on OTP verification**, not on registration. Unverified users have no wallet and cannot access protected endpoints.

3. **Funding accepts any supported currency**. The spec says "starting with NGN" which we interpret as NGN being the base/default currency. The implementation allows funding in any supported currency. The initial seeded balance is always NGN = 0.

4. **SMTP email is optional for local development**. OTP codes are saved to the database regardless of email delivery. Use `POST /auth/dev/otp` to retrieve codes directly during development.

5. **`POST /auth/dev/otp` is a development-only endpoint**. It throws `400` if `NODE_ENV=production`. Remove or gate this before going live.

6. **Rates are directional**: `GET /fx/rates?base=NGN` returns how much of each target currency 1 NGN buys. Cross-currency conversions (USD → EUR) fetch USD-based rates directly.

7. **OTP is 6-digit numeric**, expires in 10 minutes, single-use, max 3 per email per 10 minutes.

8. **Offset-based pagination** is used on `/transactions` and all admin list endpoints. Cursor-based pagination is recommended at scale.

9. **`locked_balance` is always 0** in this MVP. The column exists to support reserved funds for limit orders and pending withdrawals in a future trading engine.

10. **Mock FX rates are static** and for local development only. Set `FX_API_KEY` in `.env` for live rates.

---

## Error Responses

All errors follow NestJS's standard format:

```json
{ "statusCode": 400, "message": "Insufficient NGN balance. Available: 500 NGN", "error": "Bad Request" }
```

| Status | Meaning |
|---|---|
| `400` | Validation error, insufficient balance, invalid/expired OTP, same-currency conversion |
| `401` | Invalid credentials, unverified account, missing/expired JWT |
| `403` | Authenticated but insufficient role (non-admin hitting admin endpoints) |
| `404` | Wallet not found |
| `409` | Email already registered |
| `429` | Rate limit hit (5 req/min on auth endpoints) |
| `500` | Unexpected server error |

Every response includes `X-Request-ID` for tracing:
```
X-Request-ID: 71d8c4a2-3f1b-4e29-b8a7-2c9f0e1d5a6b
```

---

## Idempotency

Fund, convert, and trade endpoints accept an optional `idempotencyKey`:

```json
POST /wallet/fund
{ "currency": "NGN", "amount": 10000, "idempotencyKey": "8a7f9b2c-1234-5678-abcd-ef0123456789" }
```

Retrying with the same key returns the original result without re-executing:

```json
{ "idempotent": true, "reference": "original-uuid", "message": "Duplicate request — original result returned" }
```

---

## System Architecture

```
                        ┌─────────────────────┐
                        │   Client            │
                        │ Browser Dashboards  │
                        │ user.html / admin.html │
                        └────────┬────────────┘
                                 │ HTTP + X-Request-ID
                                 ▼
                        ┌─────────────────────┐
                        │    NestJS API        │
                        │    :3000             │
                        │  ThrottlerGuard      │
                        │  CorrelationId MW    │
                        └──────┬──────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                       ▼
┌─────────────┐      ┌──────────────────┐    ┌──────────────┐
│ Auth Module │      │  Wallet Service  │    │  FX Service  │
│ JWT + OTP   │      │  Ledger Engine   │    │  Rate Cache  │
│ RolesGuard  │      │  Row-level locks │    │  Mock/Live   │
└─────────────┘      └────────┬─────────┘    └──────┬───────┘
                              │                      │
              ┌───────────────┘                      │
              ▼                                      ▼
┌─────────────────────────┐             ┌────────────────────┐
│      PostgreSQL          │             │       Redis         │
│                          │             │                    │
│  users (role, verified)  │             │  FX_RATE:NGN_USD   │
│  wallets                 │             │  FX_RATE:NGN_EUR   │
│  wallet_balances         │             │  TTL: 5 min        │
│  ledger_entries (rate+ts)│             └────────────────────┘
│  transactions (idempkey) │
│  otps                    │                      ▲
└─────────────────────────┘                       │ cache miss
                                                  ▼
                                    ┌─────────────────────────┐
                                    │   ExchangeRate API       │
                                    │   (external)            │
                                    │                         │
                                    │   fallback:             │
                                    │   MockFxProvider        │
                                    └─────────────────────────┘

Admin endpoints (/admin/*) require ADMIN role JWT.
All financial ops are atomic DB transactions with row-level locking.
```

---

## Running Tests

```bash
npm test           # run all unit tests
npm run test:cov   # with coverage report
npm run test:watch # watch mode
```

Tests cover `WalletService` (fund, convert, insufficient balance, same-currency guard) and `FxService` (cache hit, mock fallback, same-currency shortcut).

---

## Project Structure

```
src/
├── common/
│   ├── decorators/       # @Roles() decorator
│   ├── enums/            # Currency, UserRole, TransactionType, etc.
│   ├── guards/           # RolesGuard
│   ├── middleware/        # CorrelationIdMiddleware
│   └── redis/            # Global Redis module + provider + decorator
├── config/
│   ├── app.config.ts     # All registerAs() config namespaces
│   └── data-source.ts    # TypeORM DataSource for CLI migrations
├── entities/
│   ├── user.entity.ts    # Includes role: UserRole
│   ├── otp.entity.ts
│   ├── wallet.entity.ts
│   ├── wallet-balance.entity.ts
│   ├── ledger-entry.entity.ts  # rate + rateTimestamp columns
│   ├── transaction.entity.ts   # idempotencyKey + rateTimestamp
│   └── index.ts
├── admin/
│   ├── admin.module.ts
│   ├── admin.service.ts  # getUsers, getTransactions, getStats
│   └── admin.controller.ts
├── auth/
│   ├── auth.dto.ts       # RegisterDto, VerifyOtpDto, LoginDto, ResendOtpDto
│   ├── auth.service.ts   # register, verifyOtp, login, resendOtp, getLatestOtp
│   ├── auth.controller.ts
│   ├── auth.module.ts
│   └── jwt.strategy.ts
├── mail/
│   ├── mail.service.ts
│   ├── mail.module.ts
│   └── templates/otp.hbs
├── fx/
│   ├── fx-rate.interface.ts
│   ├── mock-fx.provider.ts   # Static rates for local dev
│   ├── fx.service.ts         # Resolution chain: cache → API → mock
│   ├── fx.controller.ts      # Public GET /fx/rates
│   └── fx.module.ts
├── wallet/
│   ├── wallet.dto.ts         # Includes idempotencyKey on all write DTOs
│   ├── wallet.service.ts     # fund, convert, trade (atomic + locking)
│   ├── wallet.controller.ts
│   └── wallet.module.ts
├── transactions/
│   ├── transactions.service.ts   # Paginated history
│   ├── transactions.controller.ts
│   └── transactions.module.ts
├── health/
│   ├── health.controller.ts  # GET /health — DB + Redis
│   └── health.module.ts
├── app.module.ts             # ThrottlerModule + CorrelationId middleware
└── main.ts                   # Bootstrap + Swagger

dashboard/
├── user.html    # User dashboard (wallet, fund, convert/trade, history, rates)
└── admin.html   # Admin dashboard (stats, users, transactions, FX monitor)

scripts/
└── seed-admin.ts  # Creates ADMIN role user from .env credentials
```