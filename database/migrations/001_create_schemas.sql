-- Migration 001: Create database schemas
-- Run as: nettapu_migrator
-- Each module gets its own schema for boundary enforcement.

BEGIN;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS listings;
CREATE SCHEMA IF NOT EXISTS auctions;
CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS admin;
CREATE SCHEMA IF NOT EXISTS integrations;
CREATE SCHEMA IF NOT EXISTS campaigns;

-- Grant USAGE on schemas to app role (allows seeing objects, not modifying DDL)
GRANT USAGE ON SCHEMA auth TO nettapu_app;
GRANT USAGE ON SCHEMA listings TO nettapu_app;
GRANT USAGE ON SCHEMA auctions TO nettapu_app;
GRANT USAGE ON SCHEMA payments TO nettapu_app;
GRANT USAGE ON SCHEMA crm TO nettapu_app;
GRANT USAGE ON SCHEMA admin TO nettapu_app;
GRANT USAGE ON SCHEMA integrations TO nettapu_app;
GRANT USAGE ON SCHEMA campaigns TO nettapu_app;

COMMIT;
