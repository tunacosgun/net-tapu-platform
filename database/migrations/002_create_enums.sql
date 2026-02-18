-- Migration 002: Create all enum types
-- Run as: nettapu_migrator

BEGIN;

-- ============================================================
-- AUTH ENUMS
-- ============================================================

CREATE TYPE auth.user_role AS ENUM (
  'superadmin',
  'admin',
  'user',
  'consultant',
  'dealer'
);

CREATE TYPE auth.consent_type AS ENUM (
  'terms_of_service',
  'privacy_policy',
  'kvkk',                    -- Turkish data protection (KVKK)
  'auction_rules',
  'marketing_communications'
);

-- ============================================================
-- LISTINGS ENUMS
-- ============================================================

CREATE TYPE listings.parcel_status AS ENUM (
  'draft',
  'active',
  'deposit_taken',
  'sold',
  'withdrawn'
);

CREATE TYPE listings.image_status AS ENUM (
  'uploading',
  'processing',          -- watermark in progress
  'ready',
  'failed'
);

-- ============================================================
-- AUCTIONS ENUMS
-- ============================================================

CREATE TYPE auctions.auction_status AS ENUM (
  'scheduled',
  'deposit_open',
  'live',
  'ended',
  'settling',
  'settled',
  'settlement_failed',
  'cancelled'
);

CREATE TYPE auctions.bid_rejection_reason AS ENUM (
  'insufficient_deposit',
  'price_changed',
  'amount_already_bid',
  'auction_not_live',
  'user_not_eligible',
  'rate_limited',
  'consent_missing',
  'below_minimum_increment'
);

CREATE TYPE auctions.settlement_action AS ENUM (
  'capture',
  'refund'
);

CREATE TYPE auctions.settlement_item_status AS ENUM (
  'pending',
  'sent',
  'acknowledged',
  'failed'
);

CREATE TYPE auctions.settlement_manifest_status AS ENUM (
  'active',
  'completed',
  'expired',
  'escalated'
);

-- ============================================================
-- PAYMENTS ENUMS
-- ============================================================

CREATE TYPE payments.deposit_status AS ENUM (
  'collected',
  'held',
  'captured',
  'refund_pending',
  'refunded',
  'expired'
);

CREATE TYPE payments.payment_status AS ENUM (
  'pending',
  'completed',
  'failed',
  'refunded',
  'partially_refunded'
);

CREATE TYPE payments.payment_method AS ENUM (
  'credit_card',
  'bank_transfer',
  'mail_order'
);

CREATE TYPE payments.pos_provider AS ENUM (
  'paytr',
  'iyzico',
  'moka'
);

CREATE TYPE payments.ledger_event AS ENUM (
  'deposit_collected',
  'deposit_held',
  'deposit_captured',
  'deposit_refund_initiated',
  'deposit_refunded',
  'deposit_expired',
  'payment_initiated',
  'payment_completed',
  'payment_failed',
  'refund_initiated',
  'refund_completed'
);

-- ============================================================
-- CRM ENUMS
-- ============================================================

CREATE TYPE crm.contact_request_type AS ENUM (
  'call_me',
  'parcel_inquiry',
  'general'
);

CREATE TYPE crm.contact_request_status AS ENUM (
  'new',
  'assigned',
  'in_progress',
  'completed',
  'cancelled'
);

CREATE TYPE crm.offer_status AS ENUM (
  'pending',
  'accepted',
  'rejected',
  'countered',
  'expired',
  'withdrawn'
);

CREATE TYPE crm.notification_channel AS ENUM (
  'sms',
  'email',
  'push',
  'whatsapp'
);

CREATE TYPE crm.notification_status AS ENUM (
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed'
);

-- ============================================================
-- ADMIN ENUMS
-- ============================================================

CREATE TYPE admin.page_type AS ENUM (
  'about',
  'vision',
  'mission',
  'legal_info',
  'real_estate_concepts',
  'withdrawal_info',
  'post_sale',
  'press',
  'custom'
);

CREATE TYPE admin.page_status AS ENUM (
  'draft',
  'published',
  'archived'
);

-- ============================================================
-- CAMPAIGNS ENUMS
-- ============================================================

CREATE TYPE campaigns.campaign_status AS ENUM (
  'draft',
  'active',
  'paused',
  'ended'
);

CREATE TYPE campaigns.campaign_type AS ENUM (
  'discount',
  'installment',
  'special_pricing',
  'gamification'
);

COMMIT;
