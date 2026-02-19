-- Migration 020: Sniper protection column + updated state transitions
-- Run as: nettapu_migrator
--
-- Changes:
--   1. Add extended_until TIMESTAMPTZ column for sniper protection
--   2. Add partial index for the auction ending worker query
--   3. Update state transition trigger: live → ending → ended (not live → ended)

BEGIN;

-- 1. Add extended_until column for sniper protection
ALTER TABLE auctions.auctions
  ADD COLUMN IF NOT EXISTS extended_until TIMESTAMPTZ;

-- 2. Partial index for the ending worker query:
--    WHERE status IN ('live', 'ending') AND NOW() >= COALESCE(extended_until, scheduled_end)
CREATE INDEX IF NOT EXISTS idx_auctions_ending_worker
  ON auctions.auctions (status, COALESCE(extended_until, scheduled_end))
  WHERE status IN ('live', 'ending');

-- 3. Update the transition trigger to route live → ending → ended
CREATE OR REPLACE FUNCTION auctions.enforce_auction_outcome_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- ==========================================================
  -- TERMINAL STATE: 'settled' — no transitions allowed
  -- ==========================================================
  IF OLD.status = 'settled' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION
        'Auction % is in terminal state "settled". No status transitions allowed. Attempted: %',
        OLD.id, NEW.status;
    END IF;
  END IF;

  -- ==========================================================
  -- TERMINAL STATE: 'cancelled' — no transitions allowed
  -- ==========================================================
  IF OLD.status = 'cancelled' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION
        'Auction % is in terminal state "cancelled". No status transitions allowed. Attempted: %',
        OLD.id, NEW.status;
    END IF;
  END IF;

  -- ==========================================================
  -- 'settling' — only allowed transition is to 'settled' or 'settlement_failed'
  -- Protected columns are frozen.
  -- ==========================================================
  IF OLD.status = 'settling' THEN
    IF NEW.final_price IS DISTINCT FROM OLD.final_price THEN
      RAISE EXCEPTION
        'Cannot modify final_price for auction % in "settling" state. Current value: %',
        OLD.id, OLD.final_price;
    END IF;

    IF NEW.winner_id IS DISTINCT FROM OLD.winner_id THEN
      RAISE EXCEPTION
        'Cannot modify winner_id for auction % in "settling" state.',
        OLD.id;
    END IF;

    IF NEW.winner_bid_id IS DISTINCT FROM OLD.winner_bid_id THEN
      RAISE EXCEPTION
        'Cannot modify winner_bid_id for auction % in "settling" state.',
        OLD.id;
    END IF;

    IF NEW.ended_at IS DISTINCT FROM OLD.ended_at THEN
      RAISE EXCEPTION
        'Cannot modify ended_at for auction % in "settling" state.',
        OLD.id;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('settled', 'settlement_failed') THEN
      RAISE EXCEPTION
        'Auction % in "settling" can only transition to "settled" or "settlement_failed". Attempted: %',
        OLD.id, NEW.status;
    END IF;
  END IF;

  -- ==========================================================
  -- 'settlement_failed' — only manual admin can transition to 'settled'
  -- Protected columns remain frozen.
  -- ==========================================================
  IF OLD.status = 'settlement_failed' THEN
    IF NEW.final_price IS DISTINCT FROM OLD.final_price THEN
      RAISE EXCEPTION
        'Cannot modify final_price for auction % in "settlement_failed" state.',
        OLD.id;
    END IF;

    IF NEW.winner_id IS DISTINCT FROM OLD.winner_id THEN
      RAISE EXCEPTION
        'Cannot modify winner_id for auction % in "settlement_failed" state.',
        OLD.id;
    END IF;

    IF NEW.winner_bid_id IS DISTINCT FROM OLD.winner_bid_id THEN
      RAISE EXCEPTION
        'Cannot modify winner_bid_id for auction % in "settlement_failed" state.',
        OLD.id;
    END IF;

    IF NEW.ended_at IS DISTINCT FROM OLD.ended_at THEN
      RAISE EXCEPTION
        'Cannot modify ended_at for auction % in "settlement_failed" state.',
        OLD.id;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status != 'settled' THEN
      RAISE EXCEPTION
        'Auction % in "settlement_failed" can only transition to "settled" (admin override). Attempted: %',
        OLD.id, NEW.status;
    END IF;
  END IF;

  -- ==========================================================
  -- 'ended' — outcome fields written ONCE. Only transition: ended → settling
  -- ==========================================================
  IF OLD.status = 'ended' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status != 'settling' THEN
      RAISE EXCEPTION
        'Auction % in "ended" can only transition to "settling". Attempted: %',
        OLD.id, NEW.status;
    END IF;
  END IF;

  -- ==========================================================
  -- 'ending' — only to 'ended' or 'cancelled'
  -- ==========================================================
  IF OLD.status = 'ending' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('ended', 'cancelled') THEN
      RAISE EXCEPTION
        'Auction % in "ending" can only transition to "ended" or "cancelled". Attempted: %',
        OLD.id, NEW.status;
    END IF;
  END IF;

  -- ==========================================================
  -- VALID STATUS TRANSITIONS (forward-only state machine)
  -- ==========================================================
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'             AND NEW.status IN ('scheduled', 'cancelled')) OR
      (OLD.status = 'scheduled'         AND NEW.status IN ('deposit_open', 'live', 'cancelled')) OR
      (OLD.status = 'deposit_open'      AND NEW.status IN ('live', 'cancelled')) OR
      (OLD.status = 'live'              AND NEW.status IN ('ending', 'cancelled')) OR
      (OLD.status = 'ending'            AND NEW.status IN ('ended', 'cancelled')) OR
      (OLD.status = 'ended'             AND NEW.status = 'settling') OR
      (OLD.status = 'settling'          AND NEW.status IN ('settled', 'settlement_failed')) OR
      (OLD.status = 'settlement_failed' AND NEW.status = 'settled') OR
      -- Terminal states (handled above, but explicit for clarity)
      (OLD.status = 'settled'           AND FALSE) OR
      (OLD.status = 'cancelled'         AND FALSE)
    ) THEN
      RAISE EXCEPTION
        'Invalid auction status transition for auction %: % → %',
        OLD.id, OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
