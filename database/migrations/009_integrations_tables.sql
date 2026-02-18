-- Migration 009: Integrations schema tables
-- Run as: nettapu_migrator

BEGIN;

-- ============================================================
-- TKGM CACHE (cached Turkish Land Registry responses)
-- ============================================================
CREATE TABLE integrations.tkgm_cache (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ada               VARCHAR(20) NOT NULL,
  parsel            VARCHAR(20) NOT NULL,
  city              VARCHAR(100) NOT NULL,
  district          VARCHAR(100) NOT NULL,
  response_data     JSONB NOT NULL,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),

  CONSTRAINT tkgm_cache_parcel_unique UNIQUE (city, district, ada, parsel)
);

-- ============================================================
-- SYNC STATE (external data sync tracking)
-- ============================================================
CREATE TABLE integrations.sync_state (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          VARCHAR(100) NOT NULL,                 -- 'google_drive', 'excel_import', etc.
  resource_id       VARCHAR(255),                          -- external resource identifier
  last_sync_at      TIMESTAMPTZ,
  next_sync_at      TIMESTAMPTZ,
  status            VARCHAR(50) NOT NULL DEFAULT 'idle',   -- idle, syncing, error, rate_limited
  error_message     TEXT,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sync_state_provider_resource_unique UNIQUE (provider, resource_id)
);

-- ============================================================
-- EXTERNAL API LOG (circuit breaker data + debugging)
-- ============================================================
CREATE TABLE integrations.external_api_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          VARCHAR(100) NOT NULL,
  endpoint          VARCHAR(500) NOT NULL,
  method            VARCHAR(10) NOT NULL,
  request_payload   JSONB,
  response_status   INTEGER,
  response_payload  JSONB,
  duration_ms       INTEGER,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grant DML to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA integrations TO nettapu_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA integrations TO nettapu_app;

COMMIT;
