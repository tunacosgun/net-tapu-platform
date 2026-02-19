-- This runs on first PostgreSQL container startup only.
-- Creates the application role with DML-only privileges.
-- The migrator role (POSTGRES_USER) is created by the container itself.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nettapu_app') THEN
    CREATE ROLE nettapu_app WITH LOGIN PASSWORD 'app_secret_change_me';
  END IF;
END
$$;

-- App role gets CONNECT only. Schema/table grants are handled per-migration.
GRANT CONNECT ON DATABASE nettapu TO nettapu_app;

-- Enable uuid-ossp extension (requires superuser, runs as POSTGRES_USER here).
-- Must exist before TypeORM connects, otherwise app user gets permission denied.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
