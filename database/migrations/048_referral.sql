-- ============================================================
-- REFERRAL (Paylaş-Kazan) System
-- ============================================================

-- 1. Add referral_code + referred_by to users
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS referral_code  VARCHAR(12) UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by    UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_users_referred_by
  ON auth.users(referred_by) WHERE referred_by IS NOT NULL;

COMMENT ON COLUMN auth.users.referral_code IS
  '8-12 char alphanumeric — unique invite code. Auto-generated on user creation.';
COMMENT ON COLUMN auth.users.referred_by IS
  'User who invited this user (recorded once at signup, immutable thereafter).';

-- 2. Backfill existing users with random referral codes (8 chars uppercase)
UPDATE auth.users
SET referral_code = upper(substring(md5(random()::text || id::text || clock_timestamp()::text), 1, 8))
WHERE referral_code IS NULL;

-- 3. Trigger: auto-generate code on insert if missing
CREATE OR REPLACE FUNCTION auth.set_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
    NEW.referral_code := upper(substring(md5(random()::text || NEW.id::text || clock_timestamp()::text), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_referral_code ON auth.users;
CREATE TRIGGER users_set_referral_code
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION auth.set_referral_code();

-- 4. Referral credits (rewards earned via referrals)
CREATE TABLE IF NOT EXISTS crm.referral_credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            VARCHAR(20) NOT NULL DEFAULT 'discount',
  -- discount | cash | coupon
  amount          NUMERIC(15,2) NOT NULL,
  currency        VARCHAR(3) NOT NULL DEFAULT 'TRY',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending | available | used | expired | cancelled
  trigger_event   VARCHAR(50) NOT NULL,
  -- e.g. 'first_deposit', 'first_bid'
  trigger_payment_id UUID,
  used_at         TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_credits_user
  ON crm.referral_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_credits_source
  ON crm.referral_credits(source_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_credits_status
  ON crm.referral_credits(status) WHERE status IN ('pending', 'available');

-- Prevent duplicate credit grants for the same trigger event
CREATE UNIQUE INDEX IF NOT EXISTS uniq_referral_credit_per_trigger
  ON crm.referral_credits(user_id, source_user_id, trigger_event);

COMMENT ON TABLE crm.referral_credits IS
  'Referral rewards. user_id = beneficiary, source_user_id = whose action triggered the credit.';
