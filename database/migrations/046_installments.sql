-- ============================================================
-- INSTALLMENTS — individual scheduled payments per plan
-- ============================================================
-- Each installment_plan has N rows here, one per scheduled charge.
-- Worker scans rows where due_date <= today AND status='pending'
-- and attempts capture via PosGateway.

CREATE TABLE payments.installments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             UUID NOT NULL REFERENCES payments.installment_plans(id) ON DELETE CASCADE,
  sequence_no         INTEGER NOT NULL,                          -- 1..N
  amount              NUMERIC(15,2) NOT NULL,
  currency            VARCHAR(3) NOT NULL DEFAULT 'TRY',
  due_date            DATE NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending | paid | failed | overdue | cancelled
  retry_count         INTEGER NOT NULL DEFAULT 0,
  last_attempt_at     TIMESTAMPTZ,
  last_error          TEXT,
  payment_id          UUID REFERENCES payments.payments(id),    -- linked when charged
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT installments_status_check CHECK (
    status IN ('pending', 'paid', 'failed', 'overdue', 'cancelled')
  ),
  CONSTRAINT installments_unique_sequence UNIQUE (plan_id, sequence_no)
);

CREATE INDEX idx_installments_plan ON payments.installments(plan_id);
CREATE INDEX idx_installments_due_pending
  ON payments.installments(due_date)
  WHERE status = 'pending';
CREATE INDEX idx_installments_status ON payments.installments(status);

COMMENT ON TABLE payments.installments IS
  'Scheduled per-installment rows. Worker processes due_date <= today AND status=pending.';

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION payments.set_installment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER installments_updated_at
  BEFORE UPDATE ON payments.installments
  FOR EACH ROW EXECUTE FUNCTION payments.set_installment_updated_at();

-- ============================================================
-- INSTALLMENT_PLAN extra columns (stored card token + auto-charge flag)
-- ============================================================
ALTER TABLE payments.installment_plans
  ADD COLUMN IF NOT EXISTS card_token        VARCHAR(500),
  ADD COLUMN IF NOT EXISTS auto_charge       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS auction_id        UUID,
  ADD COLUMN IF NOT EXISTS first_due_date    DATE,
  ADD COLUMN IF NOT EXISTS notes             TEXT;

COMMENT ON COLUMN payments.installment_plans.card_token IS
  'Tokenized card for recurring auto-charges. Encrypted at rest.';
COMMENT ON COLUMN payments.installment_plans.auto_charge IS
  'If false, user must manually pay each installment.';
