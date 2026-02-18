-- Migration 010: Campaigns schema tables
-- Run as: nettapu_migrator

BEGIN;

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE campaigns.campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             VARCHAR(500) NOT NULL,
  description       TEXT,
  campaign_type     campaigns.campaign_type NOT NULL,
  status            campaigns.campaign_status NOT NULL DEFAULT 'draft',
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  discount_percent  NUMERIC(5,2),
  discount_amount   NUMERIC(15,2),
  max_uses          INTEGER,
  current_uses      INTEGER NOT NULL DEFAULT 0,
  metadata          JSONB,                                 -- type-specific config (installment terms, etc.)
  created_by        UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CAMPAIGN RULES (targeting criteria)
-- ============================================================
CREATE TABLE campaigns.campaign_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES campaigns.campaigns(id) ON DELETE CASCADE,
  rule_type         VARCHAR(100) NOT NULL,                 -- 'city', 'price_range', 'land_type', 'user_segment'
  rule_value        JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CAMPAIGN ASSIGNMENTS (campaign-to-parcel link)
-- ============================================================
CREATE TABLE campaigns.campaign_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES campaigns.campaigns(id) ON DELETE CASCADE,
  parcel_id         UUID NOT NULL,                         -- references listings.parcels(id)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT campaign_assignments_unique UNIQUE (campaign_id, parcel_id)
);

-- Grant DML to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA campaigns TO nettapu_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA campaigns TO nettapu_app;

COMMIT;
