-- Migration 016: Add optimistic lock version column to auctions + IP to bids
-- Run as: nettapu_migrator

BEGIN;

-- Optimistic lock counter for race-condition-safe bid processing.
-- Auto-incremented by TypeORM @VersionColumn().
-- NOT in the frozen column set (trigger 011 only protects final_price,
-- winner_id, winner_bid_id, ended_at), so safe during 'live' state.
ALTER TABLE auctions.auctions
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- IP address for bid audit trail.
-- The bids table is append-only (trigger 012), so this column is
-- write-once per row — part of the immutable audit record.
ALTER TABLE auctions.bids
  ADD COLUMN ip_address INET;

COMMIT;
