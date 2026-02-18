-- Migration 013: Performance indexes
-- Run as: nettapu_migrator

BEGIN;

-- ============================================================
-- AUTH INDEXES
-- ============================================================
CREATE INDEX idx_users_email ON auth.users (email);
CREATE INDEX idx_users_phone ON auth.users (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_refresh_tokens_user ON auth.refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_expires ON auth.refresh_tokens (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_consents_user ON auth.consents (user_id, consent_type);

-- ============================================================
-- LISTINGS INDEXES
-- ============================================================
CREATE INDEX idx_parcels_status ON listings.parcels (status);
CREATE INDEX idx_parcels_city ON listings.parcels (city, district);
CREATE INDEX idx_parcels_price ON listings.parcels (price) WHERE status = 'active';
CREATE INDEX idx_parcels_created_by ON listings.parcels (created_by);
CREATE INDEX idx_parcels_consultant ON listings.parcels (assigned_consultant) WHERE assigned_consultant IS NOT NULL;
CREATE INDEX idx_parcels_search ON listings.parcels USING GIN (search_vector);
CREATE INDEX idx_parcels_auction_eligible ON listings.parcels (id) WHERE is_auction_eligible = TRUE AND status = 'active';
CREATE INDEX idx_parcel_images_parcel ON listings.parcel_images (parcel_id, sort_order);
CREATE INDEX idx_favorites_user ON listings.favorites (user_id);
CREATE INDEX idx_favorites_parcel ON listings.favorites (parcel_id);
CREATE INDEX idx_saved_searches_user ON listings.saved_searches (user_id);

-- ============================================================
-- AUCTIONS INDEXES
-- ============================================================
CREATE INDEX idx_auctions_status ON auctions.auctions (status);
CREATE INDEX idx_auctions_parcel ON auctions.auctions (parcel_id);
CREATE INDEX idx_auctions_scheduled ON auctions.auctions (scheduled_start) WHERE status IN ('scheduled', 'deposit_open');
CREATE INDEX idx_auction_participants_auction ON auctions.auction_participants (auction_id) WHERE eligible = TRUE;
CREATE INDEX idx_auction_participants_user ON auctions.auction_participants (user_id);
CREATE INDEX idx_bids_auction ON auctions.bids (auction_id, server_ts);
CREATE INDEX idx_bids_auction_amount ON auctions.bids (auction_id, amount DESC);
CREATE INDEX idx_bids_user ON auctions.bids (user_id);
CREATE INDEX idx_bids_idempotency ON auctions.bids (idempotency_key);
CREATE INDEX idx_bid_rejections_auction ON auctions.bid_rejections (auction_id, server_ts);
CREATE INDEX idx_auction_consents_auction ON auctions.auction_consents (auction_id);
CREATE INDEX idx_settlement_manifests_status ON auctions.settlement_manifests (status) WHERE status = 'active';

-- ============================================================
-- PAYMENTS INDEXES
-- ============================================================
CREATE INDEX idx_deposits_user ON payments.deposits (user_id);
CREATE INDEX idx_deposits_auction ON payments.deposits (auction_id);
CREATE INDEX idx_deposits_status ON payments.deposits (status);
CREATE INDEX idx_deposits_auction_status ON payments.deposits (auction_id, status);
CREATE INDEX idx_deposit_transitions_deposit ON payments.deposit_transitions (deposit_id, created_at);
CREATE INDEX idx_payments_user ON payments.payments (user_id);
CREATE INDEX idx_payments_status ON payments.payments (status);
CREATE INDEX idx_payment_ledger_deposit ON payments.payment_ledger (deposit_id) WHERE deposit_id IS NOT NULL;
CREATE INDEX idx_payment_ledger_payment ON payments.payment_ledger (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_payment_ledger_created ON payments.payment_ledger (created_at);
CREATE INDEX idx_pos_transactions_external ON payments.pos_transactions (provider, external_id);
CREATE INDEX idx_refunds_deposit ON payments.refunds (deposit_id) WHERE deposit_id IS NOT NULL;
CREATE INDEX idx_idempotency_keys_expires ON payments.idempotency_keys (expires_at);

-- ============================================================
-- CRM INDEXES
-- ============================================================
CREATE INDEX idx_contact_requests_status ON crm.contact_requests (status);
CREATE INDEX idx_contact_requests_user ON crm.contact_requests (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_appointments_consultant ON crm.appointments (consultant_id, scheduled_at);
CREATE INDEX idx_offers_parcel ON crm.offers (parcel_id, status);
CREATE INDEX idx_offers_user ON crm.offers (user_id);
CREATE INDEX idx_notification_queue_status ON crm.notification_queue (status, scheduled_for) WHERE status = 'queued';
CREATE INDEX idx_notification_log_user ON crm.notification_log (user_id, created_at);
CREATE INDEX idx_user_activity_user ON crm.user_activity_log (user_id, created_at);
CREATE INDEX idx_user_activity_resource ON crm.user_activity_log (resource_type, resource_id);

-- ============================================================
-- ADMIN INDEXES
-- ============================================================
CREATE INDEX idx_pages_type ON admin.pages (page_type, status);
CREATE INDEX idx_pages_slug ON admin.pages (slug);
CREATE INDEX idx_audit_log_actor ON admin.audit_log (actor_id, created_at);
CREATE INDEX idx_audit_log_resource ON admin.audit_log (resource_type, resource_id);
CREATE INDEX idx_audit_log_created ON admin.audit_log (created_at);

-- ============================================================
-- INTEGRATIONS INDEXES
-- ============================================================
CREATE INDEX idx_tkgm_cache_expires ON integrations.tkgm_cache (expires_at);
CREATE INDEX idx_external_api_log_provider ON integrations.external_api_log (provider, created_at);

-- ============================================================
-- CAMPAIGNS INDEXES
-- ============================================================
CREATE INDEX idx_campaigns_status ON campaigns.campaigns (status);
CREATE INDEX idx_campaigns_dates ON campaigns.campaigns (starts_at, ends_at) WHERE status = 'active';
CREATE INDEX idx_campaign_assignments_parcel ON campaigns.campaign_assignments (parcel_id);

COMMIT;
