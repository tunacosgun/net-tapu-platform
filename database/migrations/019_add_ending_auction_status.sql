-- Migration 019: Add 'ending' to auction_status enum
-- Run as: nettapu_migrator
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block.

ALTER TYPE auctions.auction_status ADD VALUE IF NOT EXISTS 'ending' AFTER 'live';
