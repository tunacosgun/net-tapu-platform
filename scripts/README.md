# NetTapu Test & Validation Scripts

All scripts connect directly to PostgreSQL and/or the running auction-service.
Run from the project root.

## Prerequisites

| Dependency | Default |
|---|---|
| PostgreSQL | `postgres://nettapu_app:nettapu_app_pass@localhost:5432/nettapu` |
| Auction service | `http://localhost:3001` |
| Redis | Required by auction-service |

Override with `DATABASE_URL` and `API_URL` environment variables.

---

## Settlement Tests (Phase 9-10)

### test-settlement.ts

Basic settlement flow — creates an ENDED auction and verifies the worker settles it.

```bash
npx ts-node scripts/test-settlement.ts
# or target a specific auction:
AUCTION_ID=<uuid> npx ts-node scripts/test-settlement.ts
```

### test-admin-settlement.ts

Admin retry and manual settlement controls.

```bash
npx ts-node scripts/test-admin-settlement.ts
```

---

## Load & Chaos Tests (Phase 12)

### test-settlement-load.ts

High-concurrency settlement — creates N auctions with M participants simultaneously.

```bash
npx ts-node scripts/test-settlement-load.ts

# Customise load:
AUCTION_COUNT=50 PARTICIPANTS=20 TIMEOUT_MS=120000 npx ts-node scripts/test-settlement-load.ts
```

| Env var | Default | Description |
|---|---|---|
| `AUCTION_COUNT` | `20` | Number of simultaneous auctions |
| `PARTICIPANTS` | `15` | Participants per auction |
| `TIMEOUT_MS` | `120000` | Max wait for all settlements |

### test-pos-chaos.ts

POS failure simulation — triggers random capture/refund failures and validates circuit breaker behaviour.

**Requires the auction-service to be running with `POS_FAIL_MODE=true`.**

```bash
# Start service with chaos enabled:
POS_FAIL_MODE=true npm run start:dev --workspace=apps/auction-service

# In another terminal:
npx ts-node scripts/test-pos-chaos.ts

# Customise:
AUCTION_COUNT=10 PARTICIPANTS=8 npx ts-node scripts/test-pos-chaos.ts
```

| Env var | Default | Description |
|---|---|---|
| `AUCTION_COUNT` | `5` | Number of auctions |
| `PARTICIPANTS` | `5` | Participants per auction |
| `TIMEOUT_MS` | `120000` | Max wait |

### test-redis-chaos.ts

Redis lock contention — creates simultaneous ENDED auctions and validates manifest uniqueness (UNIQUE constraint) and idempotency.

```bash
npx ts-node scripts/test-redis-chaos.ts

AUCTION_COUNT=20 npx ts-node scripts/test-redis-chaos.ts
```

| Env var | Default | Description |
|---|---|---|
| `AUCTION_COUNT` | `10` | Number of simultaneous auctions |
| `PARTICIPANTS` | `5` | Participants per auction |
| `TIMEOUT_MS` | `90000` | Max wait |

### test-db-deadlock.ts

DB deadlock simulation — holds a pessimistic row lock on a deposit, then verifies the settlement worker retries and eventually completes.

```bash
npx ts-node scripts/test-db-deadlock.ts

LOCK_HOLD_MS=15000 npx ts-node scripts/test-db-deadlock.ts
```

| Env var | Default | Description |
|---|---|---|
| `LOCK_HOLD_MS` | `8000` | How long to hold the lock |
| `TIMEOUT_MS` | `60000` | Max wait for settlement |

### test-memory-guard.ts

Oversized manifest guard — creates an auction with >500 participants and validates immediate escalation to `SETTLEMENT_FAILED` without processing any items.

```bash
npx ts-node scripts/test-memory-guard.ts

PARTICIPANT_COUNT=800 npx ts-node scripts/test-memory-guard.ts
```

| Env var | Default | Description |
|---|---|---|
| `PARTICIPANT_COUNT` | `601` | Number of participants (limit is 500) |
| `TIMEOUT_MS` | `60000` | Max wait |

### test-metrics-validation.ts

Metrics endpoint validation — fetches `GET /metrics` and checks all Phase 9-11 metric names, histogram buckets, and infrastructure gauges exist.

```bash
npx ts-node scripts/test-metrics-validation.ts

API_URL=http://localhost:3001 npx ts-node scripts/test-metrics-validation.ts
```

### validate-ledger-integrity.ts

Financial invariant checker — scans the entire payments system for consistency violations.

```bash
# All settled auctions:
npx ts-node scripts/validate-ledger-integrity.ts

# Single auction:
AUCTION_ID=<uuid> npx ts-node scripts/validate-ledger-integrity.ts
```

Checks:
- Every captured deposit has exactly 1 `DEPOSIT_CAPTURED` ledger entry
- Every refunded deposit has `DEPOSIT_REFUND_INITIATED` + `DEPOSIT_REFUNDED`
- No negative ledger amounts
- Per-auction balance: captures + refunds = total deposits
- No orphan transitions or ledger entries

---

## WebSocket Tests

```bash
node scripts/ws-test-auth.mjs
node scripts/ws-test-auction-ratelimit.mjs
node scripts/ws-test-bidfloor.mjs
node scripts/ws-test-enumeration.mjs
node scripts/ws-test-multiinstance.mjs
node scripts/ws-test-ratelimit.mjs
node scripts/ws-test-redis-outage.mjs
```

---

## Running All Phase 12 Tests

```bash
# Without POS chaos (service running normally):
npx ts-node scripts/test-settlement-load.ts && \
npx ts-node scripts/test-redis-chaos.ts && \
npx ts-node scripts/test-db-deadlock.ts && \
npx ts-node scripts/test-memory-guard.ts && \
npx ts-node scripts/test-metrics-validation.ts && \
npx ts-node scripts/validate-ledger-integrity.ts

# POS chaos (service running with POS_FAIL_MODE=true):
npx ts-node scripts/test-pos-chaos.ts
```
