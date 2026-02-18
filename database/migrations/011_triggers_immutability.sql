-- Migration 011: Auction outcome immutability triggers
-- Run as: nettapu_migrator
--
-- HARDENING RULE: Once an auction transitions to 'ended', the fields
-- final_price, winner_id, winner_bid_id, and ended_at are frozen.
-- No UPDATE is allowed when status is in ('settling', 'settled').
-- The 'settled' and 'cancelled' states are terminal — no outbound transitions.

BEGIN;

-- ============================================================
-- AUCTION OUTCOME IMMUTABILITY TRIGGER
-- ============================================================

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
  -- 'settling' — only allowed transition is to 'settled'
  -- Protected columns are frozen.
  -- ==========================================================
  IF OLD.status = 'settling' THEN
    -- Protect frozen columns
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

    -- Only allow transition to 'settled'
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status != 'settled' THEN
      RAISE EXCEPTION
        'Auction % in "settling" can only transition to "settled". Attempted: %',
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
  -- 'ended' — this is where outcome fields get written ONCE
  -- Only transition allowed: ended → settling
  -- ==========================================================
  IF OLD.status = 'ended' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status != 'settling' THEN
      RAISE EXCEPTION
        'Auction % in "ended" can only transition to "settling". Attempted: %',
        OLD.id, NEW.status;
    END IF;
  END IF;

  -- ==========================================================
  -- VALID STATUS TRANSITIONS (forward-only state machine)
  -- ==========================================================
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'scheduled'        AND NEW.status IN ('deposit_open', 'cancelled')) OR
      (OLD.status = 'deposit_open'     AND NEW.status IN ('live', 'cancelled')) OR
      (OLD.status = 'live'             AND NEW.status IN ('ended', 'cancelled')) OR
      (OLD.status = 'ended'            AND NEW.status = 'settling') OR
      (OLD.status = 'settling'         AND NEW.status IN ('settled', 'settlement_failed')) OR
      (OLD.status = 'settlement_failed' AND NEW.status = 'settled') OR
      -- Terminal states (handled above, but explicit for clarity)
      (OLD.status = 'settled'          AND FALSE) OR
      (OLD.status = 'cancelled'        AND FALSE)
    ) THEN
      RAISE EXCEPTION
        'Invalid auction status transition for auction %: % → %',
        OLD.id, OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auction_outcome_immutability
  BEFORE UPDATE ON auctions.auctions
  FOR EACH ROW
  EXECUTE FUNCTION auctions.enforce_auction_outcome_immutability();

-- ============================================================
-- DEPOSIT STATUS TRANSITION ENFORCEMENT
-- Forward-only state machine for deposits.
-- ============================================================

CREATE OR REPLACE FUNCTION payments.enforce_deposit_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'collected'       AND NEW.status = 'held') OR
      (OLD.status = 'held'            AND NEW.status IN ('captured', 'refund_pending', 'expired')) OR
      (OLD.status = 'refund_pending'  AND NEW.status = 'refunded') OR
      -- Terminal states: captured, refunded, expired — no outbound transitions
      (OLD.status IN ('captured', 'refunded', 'expired') AND FALSE)
    ) THEN
      RAISE EXCEPTION
        'Invalid deposit status transition for deposit %: % → %',
        OLD.id, OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deposit_status_transition
  BEFORE UPDATE ON payments.deposits
  FOR EACH ROW
  EXECUTE FUNCTION payments.enforce_deposit_status_transition();

COMMIT;
