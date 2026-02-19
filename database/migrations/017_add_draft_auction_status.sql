-- Migration 017: Add 'draft' to auction_status enum
-- Run as: nettapu_migrator
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in PG < 12.
-- PG 16 supports it, but we keep it outside BEGIN/COMMIT for maximum safety.

ALTER TYPE auctions.auction_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'scheduled';

-- Update column default to draft
ALTER TABLE auctions.auctions ALTER COLUMN status SET DEFAULT 'draft';
