-- Migration 006: Payments schema tables
-- Run as: nettapu_migrator

BEGIN;

-- ============================================================
-- DEPOSITS
-- ============================================================
CREATE TABLE payments.deposits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  auction_id        UUID NOT NULL,                       -- references auctions.auctions(id), no FK across schemas
  amount            NUMERIC(15,2) NOT NULL,
  currency          VARCHAR(3) NOT NULL DEFAULT 'TRY',
  status            payments.deposit_status NOT NULL DEFAULT 'collected',
  payment_method    payments.payment_method NOT NULL,
  pos_provider      payments.pos_provider,
  pos_transaction_id VARCHAR(255),
  idempotency_key   VARCHAR(255) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT deposits_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT deposits_user_auction_unique UNIQUE (user_id, auction_id)
);

-- ============================================================
-- DEPOSIT TRANSITIONS (APPEND-ONLY ledger — trigger in migration 012)
-- ============================================================
CREATE TABLE payments.deposit_transitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id        UUID NOT NULL REFERENCES payments.deposits(id),
  from_status       payments.deposit_status,
  to_status         payments.deposit_status NOT NULL,
  event             payments.ledger_event NOT NULL,
  reason            VARCHAR(500),
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PAYMENTS (general payment records beyond deposits)
-- ============================================================
CREATE TABLE payments.payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  parcel_id         UUID,                                -- references listings.parcels(id)
  auction_id        UUID,
  amount            NUMERIC(15,2) NOT NULL,
  currency          VARCHAR(3) NOT NULL DEFAULT 'TRY',
  status            payments.payment_status NOT NULL DEFAULT 'pending',
  payment_method    payments.payment_method NOT NULL,
  description       VARCHAR(500),
  idempotency_key   VARCHAR(255) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT payments_idempotency_unique UNIQUE (idempotency_key)
);

-- ============================================================
-- PAYMENT LEDGER (APPEND-ONLY — trigger in migration 012)
-- ============================================================
CREATE TABLE payments.payment_ledger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id        UUID REFERENCES payments.payments(id),
  deposit_id        UUID REFERENCES payments.deposits(id),
  event             payments.ledger_event NOT NULL,
  amount            NUMERIC(15,2) NOT NULL,
  currency          VARCHAR(3) NOT NULL DEFAULT 'TRY',
  balance_after     NUMERIC(15,2),
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT payment_ledger_has_reference CHECK (
    payment_id IS NOT NULL OR deposit_id IS NOT NULL
  )
);

-- ============================================================
-- POS TRANSACTIONS (raw POS gateway records)
-- ============================================================
CREATE TABLE payments.pos_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          payments.pos_provider NOT NULL,
  external_id       VARCHAR(255),                        -- POS provider's transaction ID
  payment_id        UUID REFERENCES payments.payments(id),
  deposit_id        UUID REFERENCES payments.deposits(id),
  amount            NUMERIC(15,2) NOT NULL,
  currency          VARCHAR(3) NOT NULL DEFAULT 'TRY',
  status            VARCHAR(50) NOT NULL,                -- provider-specific status
  request_payload   JSONB,
  response_payload  JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- REFUNDS
-- ============================================================
CREATE TABLE payments.refunds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id        UUID REFERENCES payments.deposits(id),
  payment_id        UUID REFERENCES payments.payments(id),
  amount            NUMERIC(15,2) NOT NULL,
  currency          VARCHAR(3) NOT NULL DEFAULT 'TRY',
  reason            VARCHAR(500) NOT NULL,
  status            VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  pos_refund_id     VARCHAR(255),
  idempotency_key   VARCHAR(255) NOT NULL,
  initiated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,

  CONSTRAINT refunds_idempotency_unique UNIQUE (idempotency_key)
);

-- ============================================================
-- INSTALLMENT PLANS
-- ============================================================
CREATE TABLE payments.installment_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  parcel_id         UUID NOT NULL,                       -- references listings.parcels(id)
  total_amount      NUMERIC(15,2) NOT NULL,
  installment_count INTEGER NOT NULL,
  paid_count        INTEGER NOT NULL DEFAULT 0,
  currency          VARCHAR(3) NOT NULL DEFAULT 'TRY',
  status            VARCHAR(50) NOT NULL DEFAULT 'active', -- active, completed, defaulted, cancelled
  plan_details      JSONB NOT NULL,                      -- installment schedule
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- IDEMPOTENCY KEYS
-- ============================================================
CREATE TABLE payments.idempotency_keys (
  key               VARCHAR(255) PRIMARY KEY,
  operation_type    VARCHAR(50) NOT NULL,
  request_hash      VARCHAR(64) NOT NULL,                -- SHA-256 of request body
  response_body     JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours')
);

-- ============================================================
-- LEDGER ANNOTATIONS (corrections for ledger entries)
-- ============================================================
CREATE TABLE payments.ledger_annotations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_entry_id   UUID NOT NULL REFERENCES payments.payment_ledger(id),
  annotation_type   VARCHAR(50) NOT NULL,                -- 'correction', 'note', 'dispute'
  description       TEXT NOT NULL,
  annotated_by      UUID NOT NULL REFERENCES auth.users(id),
  approved_by       UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grant DML to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA payments TO nettapu_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA payments TO nettapu_app;

COMMIT;
