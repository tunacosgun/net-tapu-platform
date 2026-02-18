-- Migration 004: Listings schema tables
-- Run as: nettapu_migrator

BEGIN;

-- ============================================================
-- PARCELS (main listing entity)
-- ============================================================
CREATE TABLE listings.parcels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        VARCHAR(20) NOT NULL,              -- human-readable unique ID (e.g. NT-2026-00001)
  title             VARCHAR(500) NOT NULL,
  description       TEXT,
  status            listings.parcel_status NOT NULL DEFAULT 'draft',

  -- Location
  city              VARCHAR(100) NOT NULL,
  district          VARCHAR(100) NOT NULL,
  neighborhood      VARCHAR(100),
  address           TEXT,
  latitude          NUMERIC(10,7),
  longitude         NUMERIC(10,7),

  -- Parcel details
  ada               VARCHAR(20),                        -- TKGM ada number
  parsel            VARCHAR(20),                        -- TKGM parsel number
  area_m2           NUMERIC(12,2),
  zoning_status     VARCHAR(200),                       -- imar durumu
  land_type         VARCHAR(100),                       -- arsa/tarla/etc

  -- Pricing
  price             NUMERIC(15,2),
  currency          VARCHAR(3) NOT NULL DEFAULT 'TRY',
  price_per_m2      NUMERIC(12,2),

  -- Flags
  is_auction_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured       BOOLEAN NOT NULL DEFAULT FALSE,
  show_listing_date BOOLEAN NOT NULL DEFAULT TRUE,

  -- Ownership
  created_by        UUID NOT NULL REFERENCES auth.users(id),
  assigned_consultant UUID REFERENCES auth.users(id),

  -- Timestamps
  listed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Full-text search
  search_vector     TSVECTOR,

  CONSTRAINT parcels_listing_id_unique UNIQUE (listing_id)
);

-- ============================================================
-- PARCEL IMAGES
-- ============================================================
CREATE TABLE listings.parcel_images (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id         UUID NOT NULL REFERENCES listings.parcels(id) ON DELETE CASCADE,
  original_url      VARCHAR(1000) NOT NULL,
  watermarked_url   VARCHAR(1000),
  thumbnail_url     VARCHAR(1000),
  status            listings.image_status NOT NULL DEFAULT 'uploading',
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_cover          BOOLEAN NOT NULL DEFAULT FALSE,
  file_size_bytes   INTEGER,
  mime_type         VARCHAR(50),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PARCEL DOCUMENTS
-- ============================================================
CREATE TABLE listings.parcel_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id         UUID NOT NULL REFERENCES listings.parcels(id) ON DELETE CASCADE,
  document_type     VARCHAR(100) NOT NULL,             -- tapu, imar, etc.
  file_url          VARCHAR(1000) NOT NULL,
  file_name         VARCHAR(255) NOT NULL,
  file_size_bytes   INTEGER,
  uploaded_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PARCEL STATUS HISTORY (audit trail for status changes)
-- ============================================================
CREATE TABLE listings.parcel_status_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id         UUID NOT NULL REFERENCES listings.parcels(id) ON DELETE CASCADE,
  from_status       listings.parcel_status,
  to_status         listings.parcel_status NOT NULL,
  changed_by        UUID NOT NULL REFERENCES auth.users(id),
  reason            VARCHAR(500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PARCEL MAP DATA (polygon boundaries, GIS data)
-- ============================================================
CREATE TABLE listings.parcel_map_data (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id         UUID NOT NULL REFERENCES listings.parcels(id) ON DELETE CASCADE,
  boundary_geojson  JSONB,                             -- GeoJSON polygon
  tkgm_data         JSONB,                             -- cached TKGM response
  ekent_url         VARCHAR(1000),                     -- E-Kent redirect URL
  google_earth_kml  TEXT,
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT parcel_map_data_parcel_unique UNIQUE (parcel_id)
);

-- ============================================================
-- FAVORITES
-- ============================================================
CREATE TABLE listings.favorites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parcel_id         UUID NOT NULL REFERENCES listings.parcels(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT favorites_unique UNIQUE (user_id, parcel_id)
);

-- ============================================================
-- SAVED SEARCHES
-- ============================================================
CREATE TABLE listings.saved_searches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              VARCHAR(200),
  filters           JSONB NOT NULL,                    -- search criteria
  notify_on_match   BOOLEAN NOT NULL DEFAULT TRUE,
  last_notified_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grant DML to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA listings TO nettapu_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA listings TO nettapu_app;

COMMIT;
