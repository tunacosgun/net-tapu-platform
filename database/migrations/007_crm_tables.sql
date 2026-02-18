-- Migration 007: CRM schema tables
-- Run as: nettapu_migrator

BEGIN;

-- ============================================================
-- CONTACT REQUESTS
-- ============================================================
CREATE TABLE crm.contact_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type              crm.contact_request_type NOT NULL,
  status            crm.contact_request_status NOT NULL DEFAULT 'new',
  user_id           UUID REFERENCES auth.users(id),        -- NULL for anonymous
  parcel_id         UUID,                                  -- references listings.parcels(id)
  name              VARCHAR(200) NOT NULL,
  phone             VARCHAR(20) NOT NULL,
  email             VARCHAR(255),
  message           TEXT,
  parcel_context    JSONB,                                 -- auto-populated parcel info for WhatsApp
  assigned_to       UUID REFERENCES auth.users(id),
  ip_address        INET,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE TABLE crm.appointments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users(id),
  parcel_id         UUID,
  consultant_id     UUID REFERENCES auth.users(id),
  contact_request_id UUID REFERENCES crm.contact_requests(id),
  scheduled_at      TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 30,
  location          VARCHAR(500),
  notes             TEXT,
  status            VARCHAR(50) NOT NULL DEFAULT 'scheduled', -- scheduled, confirmed, completed, cancelled, no_show
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- OFFERS (user makes offer on a parcel)
-- ============================================================
CREATE TABLE crm.offers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  parcel_id         UUID NOT NULL,                         -- references listings.parcels(id)
  amount            NUMERIC(15,2) NOT NULL,
  currency          VARCHAR(3) NOT NULL DEFAULT 'TRY',
  status            crm.offer_status NOT NULL DEFAULT 'pending',
  message           TEXT,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- OFFER RESPONSES (admin or counter-offer)
-- ============================================================
CREATE TABLE crm.offer_responses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id          UUID NOT NULL REFERENCES crm.offers(id),
  responded_by      UUID NOT NULL REFERENCES auth.users(id),
  response_type     VARCHAR(50) NOT NULL,                  -- 'accept', 'reject', 'counter'
  counter_amount    NUMERIC(15,2),
  message           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATION QUEUE (pending notifications to dispatch)
-- ============================================================
CREATE TABLE crm.notification_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  channel           crm.notification_channel NOT NULL,
  status            crm.notification_status NOT NULL DEFAULT 'queued',
  subject           VARCHAR(500),
  body              TEXT NOT NULL,
  metadata          JSONB,                                 -- template vars, parcel info, etc.
  scheduled_for     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts          INTEGER NOT NULL DEFAULT 0,
  max_attempts      INTEGER NOT NULL DEFAULT 3,
  last_attempt_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATION LOG (sent notifications — historical record)
-- ============================================================
CREATE TABLE crm.notification_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id          UUID REFERENCES crm.notification_queue(id),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  channel           crm.notification_channel NOT NULL,
  status            crm.notification_status NOT NULL,
  subject           VARCHAR(500),
  body              TEXT NOT NULL,
  provider_response JSONB,
  delivered_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USER ACTIVITY LOG
-- ============================================================
CREATE TABLE crm.user_activity_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users(id),        -- NULL for anonymous
  session_id        VARCHAR(255),
  action            VARCHAR(100) NOT NULL,                 -- 'view_parcel', 'search', 'add_favorite', etc.
  resource_type     VARCHAR(50),                           -- 'parcel', 'auction', 'page'
  resource_id       UUID,
  metadata          JSONB,
  ip_address        INET,
  user_agent        VARCHAR(500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grant DML to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA crm TO nettapu_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crm TO nettapu_app;

COMMIT;
