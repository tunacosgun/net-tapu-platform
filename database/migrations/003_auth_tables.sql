-- Migration 003: Auth schema tables
-- Run as: nettapu_migrator

BEGIN;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE auth.users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) NOT NULL,
  phone           VARCHAR(20),
  password_hash   VARCHAR(255) NOT NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  tc_kimlik_no    VARCHAR(11),                 -- Turkish national ID
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_phone_unique UNIQUE (phone),
  CONSTRAINT users_tc_kimlik_unique UNIQUE (tc_kimlik_no)
);

-- ============================================================
-- ROLES (static reference table)
-- ============================================================
CREATE TABLE auth.roles (
  id              SERIAL PRIMARY KEY,
  name            auth.user_role NOT NULL,
  description     VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT roles_name_unique UNIQUE (name)
);

-- Seed default roles
INSERT INTO auth.roles (name, description) VALUES
  ('superadmin', 'Full system access'),
  ('admin', 'Administrative access'),
  ('user', 'Standard registered user'),
  ('consultant', 'Sales consultant with assigned parcels'),
  ('dealer', 'External dealer with quota limits');

-- ============================================================
-- USER_ROLES (many-to-many)
-- ============================================================
CREATE TABLE auth.user_roles (
  id              SERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id         INTEGER NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
  granted_by      UUID REFERENCES auth.users(id),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_roles_unique UNIQUE (user_id, role_id)
);

-- ============================================================
-- REFRESH TOKENS
-- ============================================================
CREATE TABLE auth.refresh_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash      VARCHAR(255) NOT NULL,
  device_info     VARCHAR(500),
  ip_address      INET,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT refresh_tokens_hash_unique UNIQUE (token_hash)
);

-- ============================================================
-- CONSENTS (legally timestamped acceptance records)
-- ============================================================
CREATE TABLE auth.consents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type    auth.consent_type NOT NULL,
  version         VARCHAR(20) NOT NULL,           -- e.g. "1.0", "2.1"
  ip_address      INET,
  user_agent      VARCHAR(500),
  accepted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ
);

-- ============================================================
-- DEALER QUOTAS
-- ============================================================
CREATE TABLE auth.dealer_quotas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  max_listings    INTEGER NOT NULL DEFAULT 0,
  max_active_listings INTEGER NOT NULL DEFAULT 0,
  region_restriction JSONB,                       -- allowed cities/districts
  commission_rate NUMERIC(5,4),                   -- e.g. 0.0250 = 2.5%
  valid_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dealer_quotas_user_unique UNIQUE (user_id)
);

-- Grant DML to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO nettapu_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth TO nettapu_app;

COMMIT;
