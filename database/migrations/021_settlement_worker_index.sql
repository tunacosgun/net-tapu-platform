-- Migration 021: Settlement worker index
-- Partial index for the settlement worker query that finds ENDED auctions needing settlement.

CREATE INDEX IF NOT EXISTS idx_auctions_settlement_pending
  ON auctions.auctions (status)
  WHERE status = 'ended';
