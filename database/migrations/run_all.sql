-- Master migration runner
-- Run as: nettapu_migrator
-- Usage: psql -U nettapu_migrator -d nettapu -f /migrations/run_all.sql

\echo '=== Migration 015: Enable uuid-ossp extension ==='
\i /migrations/015_enable_uuid_extension.sql

\echo '=== Migration 001: Create schemas ==='
\i /migrations/001_create_schemas.sql

\echo '=== Migration 002: Create enums ==='
\i /migrations/002_create_enums.sql

\echo '=== Migration 003: Auth tables ==='
\i /migrations/003_auth_tables.sql

\echo '=== Migration 004: Listings tables ==='
\i /migrations/004_listings_tables.sql

\echo '=== Migration 005: Auctions tables ==='
\i /migrations/005_auctions_tables.sql

\echo '=== Migration 006: Payments tables ==='
\i /migrations/006_payments_tables.sql

\echo '=== Migration 007: CRM tables ==='
\i /migrations/007_crm_tables.sql

\echo '=== Migration 008: Admin tables ==='
\i /migrations/008_admin_tables.sql

\echo '=== Migration 009: Integrations tables ==='
\i /migrations/009_integrations_tables.sql

\echo '=== Migration 010: Campaigns tables ==='
\i /migrations/010_campaigns_tables.sql

\echo '=== Migration 011: Immutability triggers ==='
\i /migrations/011_triggers_immutability.sql

\echo '=== Migration 012: Append-only triggers ==='
\i /migrations/012_triggers_append_only.sql

\echo '=== Migration 013: Indexes ==='
\i /migrations/013_indexes.sql

\echo '=== Migration 014: Revoke DDL from app role ==='
\i /migrations/014_revoke_ddl_from_app.sql

\echo '=== Migration 016: Auction version column + bid IP ==='
\i /migrations/016_auction_version_and_bid_ip.sql

\echo '=== Migration 017: Add draft auction status ==='
\i /migrations/017_add_draft_auction_status.sql

\echo '=== Migration 018: Update auction transitions for draft ==='
\i /migrations/018_update_auction_transitions_for_draft.sql

\echo '=== Migration 019: Add ending auction status ==='
\i /migrations/019_add_ending_auction_status.sql

\echo '=== Migration 020: Sniper protection and ending transitions ==='
\i /migrations/020_sniper_protection_and_ending_transitions.sql

\echo '=== All migrations completed successfully ==='
