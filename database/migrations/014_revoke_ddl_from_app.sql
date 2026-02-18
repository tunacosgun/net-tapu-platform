-- Migration 014: Restrict app role to DML only
-- Run as: nettapu_migrator
--
-- The nettapu_app role can SELECT, INSERT, UPDATE, DELETE on tables.
-- It CANNOT:
--   - CREATE or DROP tables
--   - CREATE or DROP triggers
--   - CREATE or DROP functions
--   - ALTER any object
--   - GRANT or REVOKE permissions
--
-- Only the nettapu_migrator role (used in CI/CD migrations) has DDL.

BEGIN;

-- Revoke schema-level CREATE from app role (cannot create tables)
REVOKE CREATE ON SCHEMA auth FROM nettapu_app;
REVOKE CREATE ON SCHEMA listings FROM nettapu_app;
REVOKE CREATE ON SCHEMA auctions FROM nettapu_app;
REVOKE CREATE ON SCHEMA payments FROM nettapu_app;
REVOKE CREATE ON SCHEMA crm FROM nettapu_app;
REVOKE CREATE ON SCHEMA admin FROM nettapu_app;
REVOKE CREATE ON SCHEMA integrations FROM nettapu_app;
REVOKE CREATE ON SCHEMA campaigns FROM nettapu_app;

-- Ensure default privileges for future tables created by migrator
-- are also granted to app role (DML only)
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA auth
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA listings
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA auctions
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA payments
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA crm
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA admin
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA integrations
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA campaigns
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nettapu_app;

-- Default privileges for sequences
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA auth
  GRANT USAGE, SELECT ON SEQUENCES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA listings
  GRANT USAGE, SELECT ON SEQUENCES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA auctions
  GRANT USAGE, SELECT ON SEQUENCES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA payments
  GRANT USAGE, SELECT ON SEQUENCES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA crm
  GRANT USAGE, SELECT ON SEQUENCES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA admin
  GRANT USAGE, SELECT ON SEQUENCES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA integrations
  GRANT USAGE, SELECT ON SEQUENCES TO nettapu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nettapu_migrator IN SCHEMA campaigns
  GRANT USAGE, SELECT ON SEQUENCES TO nettapu_app;

COMMIT;
