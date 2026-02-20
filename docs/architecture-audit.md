# NetTapu Platform — Architecture Audit

**Date:** 2026-02-20
**Scope:** Full codebase audit prior to Admin Panel, Web Portal, Mobile, and Payment integrations
**Method:** Static analysis of all source files, import graphs, entity definitions, transaction boundaries, security controls

---

## 1. Current Architecture Summary

### Topology

```
┌─────────────┐
│    nginx     │  :80 / :443
│ (reverse     │  rate-limit zones: api=30/s, auth=5/s, ws=10/s
│  proxy)      │
└──────┬───────┘
       │
  ┌────┴─────────────────────────┐
  │                              │
  ▼                              ▼
┌──────────────┐     ┌────────────────────┐
│  monolith    │     │  auction-service    │
│  :3000       │     │  :3001              │
│              │     │                     │
│  Auth (JWT)  │     │  Auctions (CRUD)    │
│  Listings*   │     │  Bids (WS + REST)   │
│  Payments*   │     │  Settlement (Worker) │
│  CRM*        │     │  WS Gateway         │
│  Admin*      │     │  Admin Finance      │
│  Campaigns*  │     │  Metrics (Prom)     │
│  Integrations│     │                     │
│  Metrics     │     │                     │
└──────┬───────┘     └──────┬──────────────┘
       │                    │
       │  TypeORM           │  TypeORM + Redis
       │                    │
  ┌────┴────────────────────┴───┐
  │         PostgreSQL 16       │
  │   8 schemas, 21 migrations  │
  │   append-only + state-machine│
  │   triggers                   │
  └─────────────────────────────┘
       ┌────────────────────┐
       │     Redis 7        │
       │  locks, pub/sub,   │
       │  WS adapter,       │
       │  rate limiting     │
       └────────────────────┘
```

*Modules marked with `*` are entity-only shells — no controllers or services yet.*

### Key Numbers

| Metric | Count |
|--------|-------|
| PostgreSQL schemas | 8 |
| SQL migrations | 21 |
| TypeORM entities (auction-service) | 11 |
| TypeORM entities (monolith) | 35 |
| Duplicated entities (same table, 2 copies) | 4 |
| NestJS modules (auction-service) | 4 |
| NestJS modules (monolith) | 10 |
| WebSocket event types | 13 |
| Prometheus metrics | 25+ |
| Integration test scripts | 7 (CI matrix) |
| Workers (polling) | 2 |
| Lines of code in SettlementService | 895 |
| Lines of business logic in controllers | ~300 |

### Domain Boundaries (as implemented)

| Domain | DB Schema | Monolith Module | Auction-Service | Status |
|--------|-----------|-----------------|-----------------|--------|
| **Auth** | `auth` | AuthModule (active) | — | Production-ready |
| **Listings** | `listings` | ListingsModule (shell) | — | Entities only |
| **Auctions** | `auctions` | — | AuctionsModule | Production-ready |
| **Payments** | `payments` | PaymentsModule (shell) | Entities inlined | **Split ownership** |
| **CRM** | `crm` | CrmModule (shell) | — | Entities only |
| **Admin** | `admin` | AdminModule (shell) | Controllers in auction-svc | **Misplaced** |
| **Integrations** | `integrations` | IntegrationsModule (shell) | — | Entities only |
| **Campaigns** | `campaigns` | CampaignsModule (shell) | — | Entities only |

---

## 2. Detected Risks

### CRITICAL — Must Fix Before Any New Feature

#### C1. Spoofable Admin Access
**Location:** `apps/auction-service/src/modules/auctions/guards/admin.guard.ts`
```typescript
const role = req.user?.role ?? req.headers?.['x-user-role'];
```
The `AdminGuard` falls back to the raw `x-user-role` HTTP header. Any request that bypasses nginx or that nginx doesn't strip reaches the auction-service with full admin privileges via a trivially spoofable header. Same issue in `BidController` (line 27: `x-user-id` fallback) and `AuctionController` (lines 33-34).

**Impact:** Unauthorized access to settlement retry, finance reconciliation, auction creation, and bid impersonation.
**Required action:** Enforce JWT-only authentication. Remove all header fallbacks.

#### C2. Entity Duplication Between Services
**Location:** 4 entities duplicated byte-for-byte between:
- `apps/auction-service/src/modules/auctions/entities/deposit.entity.ts`
- `apps/monolith/src/modules/payments/entities/deposit.entity.ts`
(and 3 more: DepositTransition, PaymentLedger, Refund)

Both services connect to the **same database** and write to the **same tables**. If one entity drifts from the other, INSERT/UPDATE operations from one service will silently lose columns or fail. There is no compile-time guard.

**Impact:** Data corruption risk on any entity modification.
**Required action:** Move shared entities to `@nettapu/shared`.

### HIGH — Fix Before External Integrations

#### H1. 895-line God Service (SettlementService)
**Location:** `apps/auction-service/src/modules/auctions/services/settlement.service.ts`
Injects 5 repositories spanning 2 domains (auctions + payments), plus DataSource and 2 services. Contains:
- Auction state machine transitions (auction domain)
- Deposit capture/refund state machine (payment domain)
- POS integration calls (infrastructure)
- Ledger writes (payment domain)
- Manifest orchestration (settlement domain)

**Impact:** Adding a real payment gateway will require modifying this monolithic service. Any change risks regression across all settlement paths.

#### H2. Business Logic in Controllers
**Location:**
- `AdminSettlementController.retry()` — 120 lines of transactional logic with pessimistic locking, manifest item iteration, and auction state transitions
- `AdminFinanceController.reconcile()` — 180 lines of reconciliation with 4 direct repository injections and raw QueryBuilder usage
- `AdminFinanceController.getSummary()` — SQL with `::numeric` casts

**Impact:** Untestable without full HTTP context. Blocks unit testing of admin operations.

#### H3. Fat WebSocket Gateway
**Location:** `apps/auction-service/src/modules/auctions/gateways/auction.gateway.ts` (445 lines)
The gateway injects 2 repositories directly and performs:
- JWT authentication (raw `jsonwebtoken.verify`, not NestJS JwtService)
- Participant authorization via DB query
- Anti-enumeration validation
- Redis health check
- Two-tier rate limiting
- Reference price computation
- Auction state snapshot assembly

A WebSocket gateway should be a transport adapter that delegates to services.

**Impact:** Cannot test authorization or bid validation without a live WebSocket connection. Reference price logic differs between REST and WS bid paths (trust model inconsistency).

#### H4. Payment Interface Too Narrow
**Location:** `apps/auction-service/src/modules/auctions/services/payment.service.ts`
```typescript
export interface IPaymentService {
  captureDeposit(req: CaptureRequest): Promise<CaptureResponse>;
  refundDeposit(req: RefundRequest): Promise<RefundResponse>;
}
```
Missing: `checkStatus()`, `voidDeposit()`, `getTransaction()`, health check. MockPaymentService doesn't track idempotency keys or state, making integration tests unrealistic for crash-recovery paths.

**Impact:** Real POS integration (PayTR, Iyzico, Moka) will require redesigning this interface and the SettlementService code that calls it.

### MEDIUM — Fix Before Horizontal Scaling

#### M1. Single-Instance Redis Lock
**Location:** `RedisLockService` uses `SET NX PX` — correct for single Redis, but no Redlock, no Sentinel, no lock renewal. If a POS call exceeds the 30s TTL, the lock expires while the operation is in flight.

#### M2. No Graceful Worker Shutdown
**Location:** Both workers' `onModuleDestroy()` clears the interval but does not wait for in-progress ticks. POS calls may be interrupted mid-flight during deployments.

#### M3. Polling Workers
**Location:** `AuctionEndingWorker` polls every 1s, `SettlementWorker` every 5s. With 1000+ concurrent auctions, the ending worker will run a query every second returning mostly empty results.

#### M4. JWT Verification Inconsistency
**Location:** Gateway uses raw `jwt.verify()` from `jsonwebtoken`. Monolith uses `@nestjs/jwt`. Same secret, but no shared validation logic. If JWT algorithm or claims change, one side breaks.

### LOW — Track for Future

#### L1. Auth DTOs Lack Validation Decorators
RegisterDto, LoginDto, RefreshDto have no `@IsEmail()`, `@MinLength()`, etc.

#### L2. Circuit Breaker Uses Simple Counter
One success resets the failure counter entirely instead of using a sliding window.

#### L3. Rate Limiter Uses Fixed Windows
Boundary burst allows up to 2x the configured limit.

#### L4. User ID Masking Duplicated
`userId.slice(0, 8) + '***'` in both BidController and AuctionGateway.

---

## 3. Proposed Modular Structure

### Target Architecture: Hexagonal per Domain Module

```
apps/auction-service/src/
├── main.ts
├── app.module.ts
├── adapters/
│   └── redis-io.adapter.ts
├── health/
├── metrics/
└── modules/
    ├── auctions/                    # AUCTION DOMAIN
    │   ├── auction.module.ts
    │   ├── domain/
    │   │   ├── auction.entity.ts
    │   │   ├── bid.entity.ts
    │   │   ├── bid-rejection.entity.ts
    │   │   ├── bid-correction.entity.ts
    │   │   ├── auction-participant.entity.ts
    │   │   ├── auction-consent.entity.ts
    │   │   └── settlement-manifest.entity.ts
    │   ├── services/
    │   │   ├── auction.service.ts        # CRUD + state machine
    │   │   ├── bid.service.ts            # Bid validation + placement
    │   │   └── bid-validation.service.ts # Pure validation (extracted)
    │   ├── controllers/
    │   │   ├── auction.controller.ts
    │   │   └── bid.controller.ts
    │   ├── gateways/
    │   │   └── auction.gateway.ts        # Transport-only adapter
    │   └── workers/
    │       └── auction-ending.worker.ts
    │
    ├── settlement/                  # SETTLEMENT DOMAIN (orchestration)
    │   ├── settlement.module.ts
    │   ├── services/
    │   │   ├── settlement.service.ts     # Orchestration only
    │   │   └── settlement-manifest.service.ts
    │   ├── controllers/
    │   │   └── admin-settlement.controller.ts
    │   └── workers/
    │       └── settlement.worker.ts
    │
    ├── payments/                    # PAYMENT DOMAIN (deposit lifecycle)
    │   ├── payment.module.ts
    │   ├── domain/                  # Entities from @nettapu/shared
    │   ├── services/
    │   │   ├── deposit-lifecycle.service.ts   # capture/refund state machine
    │   │   └── payment-gateway.service.ts     # POS integration + circuit breaker
    │   └── controllers/
    │       └── admin-finance.controller.ts
    │
    └── infrastructure/              # CROSS-CUTTING
        ├── infrastructure.module.ts
        ├── redis-lock.service.ts
        ├── guards/
        │   ├── jwt-auth.guard.ts         # Shared JWT guard (no header fallback)
        │   └── roles.guard.ts
        └── interceptors/
            └── ws-auth.interceptor.ts
```

### Shared Package Evolution

```
packages/shared/src/
├── enums/            # (existing — no change)
├── types/            # (existing — no change)
├── observability/    # (existing — no change)
└── entities/         # NEW: shared entity definitions
    ├── deposit.entity.ts
    ├── deposit-transition.entity.ts
    ├── payment-ledger.entity.ts
    └── refund.entity.ts
```

Both apps import entities from `@nettapu/shared/entities` instead of maintaining local copies.

### Key Principles

1. **No repository injection in controllers or gateways** — controllers call services only
2. **No business logic in transport layer** — gateway delegates all logic to services
3. **One domain per module** — settlement module orchestrates, payment module owns deposit lifecycle
4. **Infrastructure is injected, not imported** — guards, locks, and metrics via DI tokens
5. **Shared entities are the source of truth** — `@nettapu/shared` owns cross-service entities

---

## 4. Horizontal Scaling Plan

### WebSocket Scalability Audit

| Question | Current State | Assessment |
|----------|--------------|------------|
| Multi-instance safe? | **Yes, with caveats.** Redis adapter broadcasts events across instances. Distributed locks prevent concurrent settlement. | Room-level operations are safe. Rate limiting counters are in Redis (shared). |
| Redis used correctly? | **Partially.** Single-instance locks (SET NX PX) are correct. But no lock renewal, no Redlock. | Adequate for 2-3 instances. Not for 10+. |
| Sticky sessions required? | **No.** The Redis adapter handles cross-instance room broadcasts. Any instance can serve any client. | Correct architecture. |
| What changes for horizontal scaling? | See below. | |

### Required Changes for Multi-Instance Deployment

#### Phase 1: Safe at 2-3 instances (current architecture, minimal changes)

1. **Lock renewal for POS calls** — Add a renewal timer in SettlementService that extends the lock TTL every 10s while processing items. Prevents lock expiry during slow POS calls.

2. **Graceful shutdown** — Add a shutdown latch in both workers:
   ```
   onModuleDestroy: set shuttingDown=true, await currentTick completion, then stop
   ```

3. **nginx upstream config** — Change from single upstream to weighted round-robin:
   ```nginx
   upstream auction_backend {
     server auction-service-1:3001;
     server auction-service-2:3001;
   }
   ```
   No sticky sessions needed — Redis adapter handles WS room broadcasts.

#### Phase 2: Safe at 5-10 instances

4. **Redis Sentinel** — Deploy 3-node Redis Sentinel for automatic failover. Update `ioredis` config to use Sentinel discovery.

5. **Worker leader election** — Only one instance should run the AuctionEndingWorker and SettlementWorker. Use Redis-based leader election (e.g., `SET leader:auction-ending {instanceId} PX 10000 NX` with renewal). Non-leaders skip ticks.

6. **Replace polling with BullMQ** — Use BullMQ (Redis-based job queue) for settlement jobs:
   - When auction ends, enqueue a settlement job
   - BullMQ handles distribution, retries, and concurrency control
   - Eliminates the polling query entirely

#### Phase 3: Safe at 10+ instances (future)

7. **Redlock** — Replace single-instance `SET NX` with Redlock across 3+ Redis nodes for critical locks (bid placement, settlement).

8. **Read replicas** — Route read-only queries (auction listing, bid history) to PostgreSQL read replicas.

9. **Connection pooling** — Add PgBouncer between services and PostgreSQL to manage connection count.

### Scaling Bottleneck Analysis

| Component | Bottleneck | Severity | Mitigation |
|-----------|-----------|----------|------------|
| PostgreSQL | Connection count (default 100) | HIGH at 5+ instances | PgBouncer |
| PostgreSQL | Pessimistic lock contention on `auctions` table | MEDIUM | Already mitigated by Redis pre-lock |
| Redis | Single instance, no failover | HIGH at any scale | Sentinel (Phase 2) |
| Settlement Worker | Polls every 5s, processes 3 manifests/tick | LOW | BullMQ (Phase 2) |
| Ending Worker | Polls every 1s | MEDIUM at 1000+ auctions | BullMQ or LISTEN/NOTIFY |
| WebSocket | Memory per connection (~50KB) | LOW at <10K | Monitor, vertical scale first |

---

## 5. Deployment Blueprint

### Production Topology (Target)

```
                          ┌─────────────────┐
                          │   Load Balancer  │
                          │ (AWS ALB / CF)   │
                          └────────┬─────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │               │
              ┌─────┴─────┐ ┌─────┴─────┐ ┌──────┴──────┐
              │  nginx-1   │ │  nginx-2   │ │  nginx-3    │
              │  (active)  │ │  (standby) │ │  (standby)  │
              └─────┬──────┘ └────┬───────┘ └──────┬──────┘
                    │             │                 │
         ┌──────────┴─────────────┴─────────────────┤
         │                                          │
    ┌────┴─────────────┐               ┌────────────┴───────────┐
    │ Monolith Pool    │               │ Auction-Service Pool   │
    │                  │               │                        │
    │ monolith-1:3000  │               │ auction-svc-1:3001     │
    │ monolith-2:3000  │               │ auction-svc-2:3001     │
    │                  │               │ auction-svc-3:3001     │
    └────┬─────────────┘               └────────────┬───────────┘
         │                                          │
         │            ┌─────────────┐               │
         └────────────┤  PgBouncer  ├───────────────┘
                      └──────┬──────┘
                             │
              ┌──────────────┼──────────────┐
              │              │               │
        ┌─────┴─────┐ ┌─────┴─────┐ ┌──────┴──────┐
        │ PG Primary │ │ PG Replica │ │ PG Replica  │
        │  (write)   │ │  (read)    │ │  (read)     │
        └────────────┘ └────────────┘ └─────────────┘

              ┌──────────────────────────┐
              │     Redis Sentinel       │
              │                          │
              │ sentinel-1  sentinel-2   │
              │ sentinel-3               │
              │                          │
              │ redis-primary            │
              │ redis-replica            │
              └──────────────────────────┘
```

### Container Definitions

| Service | Replicas | Resources (min) | Health Check | Notes |
|---------|----------|-----------------|-------------|-------|
| nginx | 2 (active/standby) | 256MB / 0.25 CPU | TCP :80 | Stateless |
| monolith | 2 | 512MB / 0.5 CPU | GET /api/v1/health | Stateless |
| auction-service | 2-3 | 1GB / 1 CPU | GET /api/v1/auctions/health | WS connections in memory |
| PostgreSQL primary | 1 | 2GB / 2 CPU | pg_isready | WAL streaming to replicas |
| PostgreSQL replica | 1-2 | 2GB / 1 CPU | pg_isready | Read-only |
| PgBouncer | 1 | 256MB / 0.25 CPU | TCP :6432 | Transaction pooling mode |
| Redis primary | 1 | 512MB / 0.5 CPU | redis-cli ping | Sentinel-managed |
| Redis replica | 1 | 512MB / 0.5 CPU | redis-cli ping | Auto-failover |
| Redis Sentinel | 3 | 128MB / 0.1 CPU | sentinel ping | Quorum=2 |

### Port Map

| Port | Service | Protocol |
|------|---------|----------|
| 443 | nginx (HTTPS) | TLS 1.2+ |
| 80 | nginx (HTTP -> 301) | Redirect only |
| 3000 | monolith (internal) | HTTP |
| 3001 | auction-service (internal) | HTTP + WS |
| 5432 | PostgreSQL (internal) | TCP |
| 6432 | PgBouncer (internal) | TCP |
| 6379 | Redis (internal) | TCP |
| 26379 | Redis Sentinel (internal) | TCP |
| 9090 | Prometheus (internal) | HTTP |

### Nginx Routing Rules (Production)

```
/api/v1/auth/*          -> monolith pool      (rate: 5/s per IP)
/api/v1/listings/*      -> monolith pool      (rate: 30/s per IP)
/api/v1/payments/*      -> monolith pool      (rate: 10/s per IP)
/api/v1/admin/*         -> monolith pool      (rate: 20/s per IP)
/api/v1/auctions/*      -> auction-svc pool   (rate: 30/s per IP)
/ws/auction/*           -> auction-svc pool   (WS upgrade, rate: 10/s per IP)
/metrics                -> internal only       (deny external)
/health                 -> 200 OK direct
```

---

## 6. Refactor Action Plan

Each step is minimal, safe, and independently deployable. Ordered by priority and dependency.

### Phase 0: Security Fix (URGENT — before any public exposure)

#### Step 0.1: Remove Header Fallbacks in AdminGuard
**Files:** `apps/auction-service/src/modules/auctions/guards/admin.guard.ts`
**Change:** Remove `req.headers?.['x-user-role']` fallback. Require JWT-verified `req.user.roles` only.
**Risk:** Zero — header fallback was a development convenience.
**Tests affected:** None — CI tests don't use the header fallback.

#### Step 0.2: Remove Header Fallback in BidController
**Files:** `apps/auction-service/src/modules/auctions/controllers/bid.controller.ts`
**Change:** Remove `req.headers?.['x-user-id']` fallback on line 27. Require JWT-verified `req.user.sub`.
**Risk:** Zero — same rationale.

#### Step 0.3: Remove Header Fallback in AuctionController
**Files:** `apps/auction-service/src/modules/auctions/controllers/auction.controller.ts`
**Change:** Remove `req.headers?.['x-user-id']` fallback on lines 33-34.
**Risk:** Zero.

### Phase 1: Entity Consolidation (1-2 days)

#### Step 1.1: Move Shared Entities to @nettapu/shared
**Files:**
- Create `packages/shared/src/entities/deposit.entity.ts` (move from auction-service)
- Create `packages/shared/src/entities/deposit-transition.entity.ts`
- Create `packages/shared/src/entities/payment-ledger.entity.ts`
- Create `packages/shared/src/entities/refund.entity.ts`
- Export from `packages/shared/src/index.ts`

**Change:** Both apps import from `@nettapu/shared` instead of maintaining local copies.
**Risk:** Low — entities are byte-for-byte identical today.
**Tests affected:** None — entity definitions are identical.

#### Step 1.2: Delete Duplicate Entity Files
**Files:** Remove the 4 entity files from:
- `apps/auction-service/src/modules/auctions/entities/`
- `apps/monolith/src/modules/payments/entities/`

Update imports in both apps to use `@nettapu/shared`.

### Phase 2: Extract Payment Domain Service (2-3 days)

#### Step 2.1: Create DepositLifecycleService
**Files:** Create `apps/auction-service/src/modules/auctions/services/deposit-lifecycle.service.ts`
**Change:** Extract from SettlementService:
- `recordCaptureInDb()` (lines 358-420)
- `recordRefundInitiationInDb()` (lines 492-562)
- `recordRefundCompletionInDb()` (lines 652-726)

These become methods on `DepositLifecycleService`. SettlementService calls `depositLifecycle.capture()` / `.initiateRefund()` / `.completeRefund()` instead.

**Risk:** Low — pure extraction, no logic change. Each method is already self-contained with its own transaction.
**Tests affected:** Run all 7 integration tests. Settlement paths are covered.

#### Step 2.2: Widen IPaymentService Interface
**Files:** `apps/auction-service/src/modules/auctions/services/payment.service.ts`
**Change:** Add to interface:
```typescript
checkTransactionStatus(posReference: string): Promise<TransactionStatus>;
isHealthy(): Promise<boolean>;
```
Add stubs to MockPaymentService.

**Risk:** Zero — additive only. Existing code unchanged.

### Phase 3: Extract Controller Business Logic (1-2 days)

#### Step 3.1: Move retry() Logic to SettlementService
**Files:**
- `apps/auction-service/src/modules/auctions/controllers/admin-settlement.controller.ts`
- `apps/auction-service/src/modules/auctions/services/settlement.service.ts`

**Change:** Create `SettlementService.retrySettlement(auctionId)`. Move the 120 lines of transaction logic from the controller into this method. Controller becomes a one-liner.

**Risk:** Low — pure extraction.
**Tests affected:** `test-admin-settlement.ts` (if run manually — not in CI matrix).

#### Step 3.2: Move reconcile() Logic to a FinanceService
**Files:**
- Create `apps/auction-service/src/modules/auctions/services/finance.service.ts`
- Slim down `AdminFinanceController`

**Change:** Move reconciliation and summary logic. Remove 4 repository injections from controller.

**Risk:** Low — pure extraction.

### Phase 4: Slim Down WebSocket Gateway (2-3 days)

#### Step 4.1: Extract WS Authentication to Middleware
**Files:** Create `apps/auction-service/src/modules/auctions/gateways/ws-auth.middleware.ts`
**Change:** Move JWT verification from `afterInit()` into a reusable middleware. Use `@nestjs/jwt` JwtService instead of raw `jsonwebtoken.verify`.

#### Step 4.2: Extract Room Authorization to Service
**Files:** Move participant lookup from gateway into `AuctionService.canJoinRoom(auctionId, userId)`
**Change:** Gateway calls service method instead of querying repository directly.

#### Step 4.3: Remove Repository Injections from Gateway
**Change:** Gateway uses `AuctionService` and `BidService` exclusively. No direct `@InjectRepository` calls.

### Phase 5: Worker Hardening (1 day)

#### Step 5.1: Add Graceful Shutdown Latch
**Files:** Both worker files
**Change:**
```typescript
private shuttingDown = false;

async onModuleDestroy() {
  this.shuttingDown = true;
  clearInterval(this.interval);
  // Wait for current tick if processing
  while (this.processing) {
    await new Promise(r => setTimeout(r, 100));
  }
}
```

#### Step 5.2: Add Lock Renewal in Settlement Processing
**Files:** `RedisLockService`, `SettlementWorker`
**Change:** Add `renewLock(key, value, ttlMs)` to RedisLockService. Settlement worker renews the lock every 10s during manifest processing.

### Phase 6: Auth DTO Validation (0.5 days)

#### Step 6.1: Add class-validator Decorators
**Files:** `apps/monolith/src/modules/auth/auth.controller.ts`
**Change:** Add `@IsEmail()`, `@MinLength(8)`, `@IsString()`, `@IsNotEmpty()` to RegisterDto, LoginDto, RefreshDto.

---

## 7. Risk Assessment Matrix

| Area | Current Risk | After Phase 0-1 | After Phase 2-4 | After Phase 5-6 |
|------|-------------|-----------------|-----------------|-----------------|
| **Security: Auth/AuthZ** | **CRITICAL** | Low | Low | Low |
| **Data Integrity: Entity Drift** | **HIGH** | Low | Low | Low |
| **Maintainability: God Service** | HIGH | HIGH | Low | Low |
| **Testability: Controller Logic** | HIGH | HIGH | Low | Low |
| **Testability: Gateway Logic** | HIGH | HIGH | HIGH | Low |
| **Scalability: Redis SPOF** | MEDIUM | MEDIUM | MEDIUM | MEDIUM* |
| **Scalability: Worker Polling** | MEDIUM | MEDIUM | MEDIUM | Low |
| **Scalability: Connection Count** | LOW | LOW | LOW | LOW |
| **Deployment: Graceful Shutdown** | MEDIUM | MEDIUM | MEDIUM | Low |
| **Payment: POS Integration** | HIGH | HIGH | MEDIUM | MEDIUM |
| **Observability** | Low | Low | Low | Low |
| **CI/CD Coverage** | Low | Low | Low | Low |
| **Database Hardening** | Low | Low | Low | Low |

*Redis Sentinel is a deployment change, not a code refactor — tracked separately in the Deployment Blueprint.

### Pre-Condition Matrix: What Blocks What

| Planned Feature | Blocks On | Phase Required |
|----------------|-----------|----------------|
| Admin Panel Backend | Phase 0 (security), Phase 3 (controller extraction) | 0 + 3 |
| Public Web Portal | Phase 0 (security), Phase 1 (entity consolidation) | 0 + 1 |
| Real Payment Gateway | Phase 0, Phase 1, Phase 2 (deposit lifecycle + interface) | 0 + 1 + 2 |
| Mobile API | Phase 0 (security), Phase 4 (gateway slimming) | 0 + 4 |
| Horizontal Scaling | Phase 5 (workers), Deployment Blueprint | 5 + infra |
| Real-time Notifications | Phase 4 (gateway patterns reusable for notification WS) | 4 |

### Effort Estimates

| Phase | Effort | Risk | Can Be Done Independently |
|-------|--------|------|--------------------------|
| Phase 0: Security Fix | 2 hours | Zero | Yes |
| Phase 1: Entity Consolidation | 1-2 days | Low | Yes |
| Phase 2: Payment Domain Extract | 2-3 days | Low | After Phase 1 |
| Phase 3: Controller Extract | 1-2 days | Low | Yes |
| Phase 4: Gateway Slimming | 2-3 days | Medium | Yes |
| Phase 5: Worker Hardening | 1 day | Low | Yes |
| Phase 6: Auth DTO Validation | 0.5 days | Zero | Yes |

**Total estimated effort: 8-12 days**

---

## Appendix A: File Cross-Reference

### Files With Highest Coupling (change risk)

| File | Lines | Incoming Deps | Outgoing Deps | Risk |
|------|-------|--------------|---------------|------|
| `settlement.service.ts` | 895 | 2 (worker, controller) | 7 (5 repos, 2 services) | **Highest** |
| `auction.gateway.ts` | 445 | 1 (module) | 5 (2 repos, 3 services) | High |
| `admin-finance.controller.ts` | 416 | 1 (module) | 4 repos | High |
| `bid.service.ts` | 368 | 2 (controller, gateway) | 5 repos, 3 services | Medium |
| `payment.service.ts` | 350 | 1 (settlement service) | 1 (metrics) | Medium |
| `admin-settlement.controller.ts` | 255 | 1 (module) | 3 repos, 1 service | High |

### Healthy Files (no changes needed)

| File | Lines | Assessment |
|------|-------|-----------|
| `auction.service.ts` | 138 | Clean CRUD + state machine |
| `auction.controller.ts` | 60 | Thin controller (except header fallback) |
| `redis-lock.service.ts` | 136 | Correct implementation for single-instance |
| `db-retry.util.ts` | ~50 | Clean utility |
| `auction-ending.worker.ts` | 231 | Well-structured (needs shutdown latch only) |
| All entity files | ~50 each | Clean TypeORM definitions |
| All shared package files | various | Clean types/enums/observability |
| All migration files | various | Well-organized, sequential |
| All CI test scripts | various | Comprehensive chaos testing |

### Import Graph (Simplified)

```
@nettapu/shared
  └── enums, types, observability
       │
       ├── monolith
       │     ├── AuthModule ──► User, Role, RefreshToken
       │     ├── ListingsModule ──► Parcel (shell)
       │     ├── PaymentsModule ──► Deposit* (shell)    ◄── DUPLICATE
       │     └── ... (5 more shells)
       │
       └── auction-service
             └── AuctionsModule
                   ├── AuctionService ──► Auction
                   ├── BidService ──► Bid, Auction, Participant ──► RedisLockService
                   ├── SettlementService ──► Auction, Manifest, Deposit*, Ledger* ──► PaymentService
                   ├── AuctionGateway ──► Auction*, Participant* ──► BidService, RedisLockService
                   ├── AuctionEndingWorker ──► Auction ──► RedisLockService, Gateway
                   └── SettlementWorker ──► SettlementService ──► RedisLockService, Gateway

* = entities accessed across domain boundaries
```
