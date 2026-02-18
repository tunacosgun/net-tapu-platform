-- Migration 005: Auctions schema tables
-- Run as: nettapu_migrator

BEGIN;

-- ============================================================
-- AUCTIONS
-- ============================================================
CREATE TABLE auctions.auctions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id           UUID NOT NULL REFERENCES listings.parcels(id),
  title               VARCHAR(500) NOT NULL,
  description         TEXT,
  status              auctions.auction_status NOT NULL DEFAULT 'scheduled',

  -- Pricing
  starting_price      NUMERIC(15,2) NOT NULL,
  minimum_increment   NUMERIC(15,2) NOT NULL,
  current_price       NUMERIC(15,2),
  currency            VARCHAR(3) NOT NULL DEFAULT 'TRY',

  -- Deposit requirement
  required_deposit    NUMERIC(15,2) NOT NULL,

  -- Outcome (frozen after 'ended' — see trigger in migration 011)
  final_price         NUMERIC(15,2),
  winner_id           UUID REFERENCES auth.users(id),
  winner_bid_id       UUID,                              -- FK added after bids table exists

  -- Schedule
  deposit_deadline    TIMESTAMPTZ NOT NULL,
  scheduled_start     TIMESTAMPTZ NOT NULL,
  scheduled_end       TIMESTAMPTZ,                       -- NULL if open-ended with countdown
  actual_start        TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,

  -- Counters (denormalized for real-time display)
  bid_count           INTEGER NOT NULL DEFAULT 0,
  participant_count   INTEGER NOT NULL DEFAULT 0,
  watcher_count       INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  settlement_metadata JSONB,
  created_by          UUID NOT NULL REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUCTION PARTICIPANTS (deposit-verified bidders)
-- ============================================================
CREATE TABLE auctions.auction_participants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id          UUID NOT NULL REFERENCES auctions.auctions(id),
  user_id             UUID NOT NULL REFERENCES auth.users(id),
  deposit_id          UUID NOT NULL,                     -- references payments.deposits(id), no FK across schemas
  eligible            BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at          TIMESTAMPTZ,
  revoke_reason       VARCHAR(500),
  registered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT auction_participants_unique UNIQUE (auction_id, user_id)
);

-- ============================================================
-- BIDS (APPEND-ONLY — enforced by trigger in migration 012)
-- ============================================================
CREATE TABLE auctions.bids (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id          UUID NOT NULL REFERENCES auctions.auctions(id),
  user_id             UUID NOT NULL REFERENCES auth.users(id),
  amount              NUMERIC(15,2) NOT NULL,
  reference_price     NUMERIC(15,2) NOT NULL,            -- price user saw when bidding
  idempotency_key     VARCHAR(255) NOT NULL,

  -- Timestamps (see Extension 2: time authority)
  server_ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- AUTHORITATIVE
  client_sent_at      TIMESTAMPTZ,                        -- debugging only
  gateway_received_at TIMESTAMPTZ,                        -- latency metrics
  processor_dequeued_at TIMESTAMPTZ,                      -- queue health

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT bids_idempotency_unique UNIQUE (idempotency_key)
);

-- Add FK from auctions.winner_bid_id to bids
ALTER TABLE auctions.auctions
  ADD CONSTRAINT auctions_winner_bid_fk
  FOREIGN KEY (winner_bid_id) REFERENCES auctions.bids(id);

-- ============================================================
-- BID REJECTIONS (APPEND-ONLY — enforced by trigger in migration 012)
-- ============================================================
CREATE TABLE auctions.bid_rejections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id          UUID NOT NULL REFERENCES auctions.auctions(id),
  user_id             UUID NOT NULL REFERENCES auth.users(id),
  attempted_amount    NUMERIC(15,2) NOT NULL,
  reason              auctions.bid_rejection_reason NOT NULL,
  details             VARCHAR(500),
  server_ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BIDS CORRECTIONS (for voided bids — requires dual admin approval)
-- ============================================================
CREATE TABLE auctions.bids_corrections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_bid_id     UUID NOT NULL REFERENCES auctions.bids(id),
  correction_type     VARCHAR(50) NOT NULL,              -- 'voided', 'annotation'
  reason              TEXT NOT NULL,
  corrected_by        UUID NOT NULL REFERENCES auth.users(id),
  approved_by         UUID REFERENCES auth.users(id),    -- second admin
  status              VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at         TIMESTAMPTZ
);

-- ============================================================
-- AUCTION CONSENTS (legally timestamped per-auction acceptance)
-- ============================================================
CREATE TABLE auctions.auction_consents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id          UUID NOT NULL REFERENCES auctions.auctions(id),
  user_id             UUID NOT NULL REFERENCES auth.users(id),
  consent_text_hash   VARCHAR(64) NOT NULL,              -- SHA-256 of consent text shown
  ip_address          INET,
  user_agent          VARCHAR(500),
  accepted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT auction_consents_unique UNIQUE (auction_id, user_id)
);

-- ============================================================
-- SETTLEMENT MANIFESTS
-- ============================================================
CREATE TABLE auctions.settlement_manifests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id          UUID NOT NULL REFERENCES auctions.auctions(id),
  manifest_data       JSONB NOT NULL,                    -- full settlement plan
  status              auctions.settlement_manifest_status NOT NULL DEFAULT 'active',
  items_total         INTEGER NOT NULL DEFAULT 0,
  items_acknowledged  INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  completed_at        TIMESTAMPTZ,
  expired_at          TIMESTAMPTZ,

  CONSTRAINT settlement_manifests_auction_unique UNIQUE (auction_id)
);

-- Grant DML to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auctions TO nettapu_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auctions TO nettapu_app;

COMMIT;
