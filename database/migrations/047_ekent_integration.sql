-- ============================================================
-- E-KENT (Kent Rehberi) Cache + Provider Registry
-- ============================================================
-- E-Kent every municipality runs its own GIS portal. We model:
--   1. ekent_providers: city → URL pattern (admin-managed)
--   2. ekent_cache: per-parcel resolved URL + scraped imar info
-- Public lookup goes through service which prefers cache, falls
-- back to provider-pattern resolution, and as last resort to
-- listings.parcel_map_data.ekent_url (manual override).

CREATE TABLE integrations.ekent_providers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city            VARCHAR(100) NOT NULL,
  district        VARCHAR(100),                       -- NULL = applies to whole city
  name            VARCHAR(200) NOT NULL,              -- e.g. "Konya Büyükşehir KBS"
  url_pattern     TEXT NOT NULL,                      -- supports {city}/{district}/{ada}/{parsel}/{neighborhood}
  imar_endpoint   TEXT,                               -- optional API for imar info
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ekent_providers_city_district_unique UNIQUE (city, district)
);

CREATE INDEX idx_ekent_providers_city ON integrations.ekent_providers(city) WHERE active = TRUE;

COMMENT ON TABLE integrations.ekent_providers IS
  'Per-municipality E-Kent URL patterns. Admin-managed.';
COMMENT ON COLUMN integrations.ekent_providers.url_pattern IS
  'URL template; placeholders: {city} {district} {neighborhood} {ada} {parsel}';

CREATE TABLE integrations.ekent_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city            VARCHAR(100) NOT NULL,
  district        VARCHAR(100) NOT NULL,
  ada             VARCHAR(20) NOT NULL,
  parsel          VARCHAR(20) NOT NULL,
  resolved_url    TEXT,                               -- final URL for this parcel
  imar_data       JSONB,                              -- scraped/structured imar info if available
  source          VARCHAR(50) NOT NULL,               -- 'provider' | 'manual' | 'fallback'
  fetched_at      TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  CONSTRAINT ekent_cache_unique UNIQUE (city, district, ada, parsel)
);

CREATE INDEX idx_ekent_cache_expires ON integrations.ekent_cache(expires_at);

-- Seed common municipalities (URL patterns are placeholders; admin should update)
INSERT INTO integrations.ekent_providers (city, district, name, url_pattern, notes) VALUES
  ('Konya', NULL, 'Konya Büyükşehir Belediyesi KBS',
   'https://kbs.konya.bel.tr/parsel-sorgu?ada={ada}&parsel={parsel}&mahalle={neighborhood}',
   'Konya BB GIS — admin should verify the actual public URL pattern.'),
  ('İstanbul', NULL, 'İstanbul Büyükşehir Belediyesi Şehir Haritası',
   'https://sehirharitasi.ibb.gov.tr/?ada={ada}&parsel={parsel}',
   'İBB Şehir Haritası — admin should confirm pattern.'),
  ('Ankara', NULL, 'Ankara Büyükşehir Belediyesi e-Belediye',
   'https://e-belediye.ankara.bel.tr/parsel?ada={ada}&parsel={parsel}',
   'Ankara BB — pattern needs verification.'),
  ('İzmir', NULL, 'İzmir Büyükşehir Belediyesi Kent Rehberi',
   'https://kentrehberi.izmir.bel.tr/?ada={ada}&parsel={parsel}',
   'İzmir BB — admin should verify.'),
  ('Antalya', NULL, 'Antalya Büyükşehir Belediyesi Kent Bilgi Sistemi',
   'https://kbs.antalya.bel.tr/parsel?ada={ada}&parsel={parsel}',
   'Antalya BB — admin should verify.')
ON CONFLICT (city, district) DO NOTHING;
