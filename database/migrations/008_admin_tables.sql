-- Migration 008: Admin schema tables
-- Run as: nettapu_migrator

BEGIN;

-- ============================================================
-- PAGES (CMS content)
-- ============================================================
CREATE TABLE admin.pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_type         admin.page_type NOT NULL,
  slug              VARCHAR(255) NOT NULL,
  title             VARCHAR(500) NOT NULL,
  content           TEXT,
  meta_title        VARCHAR(200),
  meta_description  VARCHAR(500),
  status            admin.page_status NOT NULL DEFAULT 'draft',
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_by        UUID NOT NULL REFERENCES auth.users(id),
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT pages_slug_unique UNIQUE (slug)
);

-- ============================================================
-- FAQ
-- ============================================================
CREATE TABLE admin.faq (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question          TEXT NOT NULL,
  answer            TEXT NOT NULL,
  category          VARCHAR(100),
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_published      BOOLEAN NOT NULL DEFAULT FALSE,
  created_by        UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- REFERENCES (partnerships, completed projects)
-- ============================================================
CREATE TABLE admin.references (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             VARCHAR(500) NOT NULL,
  description       TEXT,
  image_url         VARCHAR(1000),
  website_url       VARCHAR(1000),
  reference_type    VARCHAR(50) NOT NULL,                  -- 'partner', 'completed_project', 'testimonial'
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_published      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MEDIA (media library for press, videos, etc.)
-- ============================================================
CREATE TABLE admin.media (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             VARCHAR(500),
  description       TEXT,
  file_url          VARCHAR(1000) NOT NULL,
  thumbnail_url     VARCHAR(1000),
  media_type        VARCHAR(50) NOT NULL,                  -- 'image', 'video', 'document', 'press'
  mime_type         VARCHAR(100),
  file_size_bytes   INTEGER,
  is_popup          BOOLEAN NOT NULL DEFAULT FALSE,        -- video popup info area
  uploaded_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SYSTEM SETTINGS (key-value configuration store)
-- ============================================================
CREATE TABLE admin.system_settings (
  key               VARCHAR(255) PRIMARY KEY,
  value             JSONB NOT NULL,
  description       VARCHAR(500),
  updated_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG (APPEND-ONLY — trigger in migration 012)
-- ============================================================
CREATE TABLE admin.audit_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id          UUID REFERENCES auth.users(id),
  actor_role        VARCHAR(50),
  action            VARCHAR(100) NOT NULL,
  resource_type     VARCHAR(50) NOT NULL,
  resource_id       UUID,
  old_value         JSONB,
  new_value         JSONB,
  ip_address        INET,
  user_agent        VARCHAR(500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grant DML to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO nettapu_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA admin TO nettapu_app;

COMMIT;
