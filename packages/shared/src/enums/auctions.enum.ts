export enum AuctionStatus {
  SCHEDULED = 'scheduled',
  DEPOSIT_OPEN = 'deposit_open',
  LIVE = 'live',
  ENDED = 'ended',
  SETTLING = 'settling',
  SETTLED = 'settled',
  SETTLEMENT_FAILED = 'settlement_failed',
  CANCELLED = 'cancelled',
}

export enum BidRejectionReason {
  INSUFFICIENT_DEPOSIT = 'insufficient_deposit',
  PRICE_CHANGED = 'price_changed',
  AMOUNT_ALREADY_BID = 'amount_already_bid',
  AUCTION_NOT_LIVE = 'auction_not_live',
  USER_NOT_ELIGIBLE = 'user_not_eligible',
  RATE_LIMITED = 'rate_limited',
  CONSENT_MISSING = 'consent_missing',
  BELOW_MINIMUM_INCREMENT = 'below_minimum_increment',
}

export enum SettlementAction {
  CAPTURE = 'capture',
  REFUND = 'refund',
}

export enum SettlementItemStatus {
  PENDING = 'pending',
  SENT = 'sent',
  ACKNOWLEDGED = 'acknowledged',
  FAILED = 'failed',
}

export enum SettlementManifestStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
  ESCALATED = 'escalated',
}
