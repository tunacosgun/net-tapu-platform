-- Migration 012: Append-only table enforcement triggers
-- Run as: nettapu_migrator
--
-- These triggers make certain tables immutable after INSERT.
-- No UPDATE, no DELETE. Ever.
-- Corrections go to dedicated correction/annotation tables.

BEGIN;

-- ============================================================
-- GENERIC APPEND-ONLY ENFORCEMENT FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION auctions.prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Table %.% is append-only. % is prohibited. Row id=%, attempted by role=%',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, OLD.id, current_user;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION payments.prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Table %.% is append-only. % is prohibited. Row id=%, attempted by role=%',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, OLD.id, current_user;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION admin.prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Table %.% is append-only. % is prohibited. Row id=%, attempted by role=%',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, OLD.id, current_user;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- AUCTIONS SCHEMA: APPEND-ONLY TABLES
-- ============================================================

-- bids: no UPDATE
CREATE TRIGGER trg_bids_no_update
  BEFORE UPDATE ON auctions.bids
  FOR EACH ROW
  EXECUTE FUNCTION auctions.prevent_modification();

-- bids: no DELETE
CREATE TRIGGER trg_bids_no_delete
  BEFORE DELETE ON auctions.bids
  FOR EACH ROW
  EXECUTE FUNCTION auctions.prevent_modification();

-- bid_rejections: no UPDATE
CREATE TRIGGER trg_bid_rejections_no_update
  BEFORE UPDATE ON auctions.bid_rejections
  FOR EACH ROW
  EXECUTE FUNCTION auctions.prevent_modification();

-- bid_rejections: no DELETE
CREATE TRIGGER trg_bid_rejections_no_delete
  BEFORE DELETE ON auctions.bid_rejections
  FOR EACH ROW
  EXECUTE FUNCTION auctions.prevent_modification();

-- ============================================================
-- PAYMENTS SCHEMA: APPEND-ONLY TABLES
-- ============================================================

-- payment_ledger: no UPDATE
CREATE TRIGGER trg_payment_ledger_no_update
  BEFORE UPDATE ON payments.payment_ledger
  FOR EACH ROW
  EXECUTE FUNCTION payments.prevent_modification();

-- payment_ledger: no DELETE
CREATE TRIGGER trg_payment_ledger_no_delete
  BEFORE DELETE ON payments.payment_ledger
  FOR EACH ROW
  EXECUTE FUNCTION payments.prevent_modification();

-- deposit_transitions: no UPDATE
CREATE TRIGGER trg_deposit_transitions_no_update
  BEFORE UPDATE ON payments.deposit_transitions
  FOR EACH ROW
  EXECUTE FUNCTION payments.prevent_modification();

-- deposit_transitions: no DELETE
CREATE TRIGGER trg_deposit_transitions_no_delete
  BEFORE DELETE ON payments.deposit_transitions
  FOR EACH ROW
  EXECUTE FUNCTION payments.prevent_modification();

-- ============================================================
-- ADMIN SCHEMA: APPEND-ONLY TABLES
-- ============================================================

-- audit_log: no UPDATE
CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON admin.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION admin.prevent_modification();

-- audit_log: no DELETE
CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON admin.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION admin.prevent_modification();

COMMIT;
