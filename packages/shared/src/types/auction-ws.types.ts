/**
 * WebSocket message types for the auction real-time protocol.
 * These types are shared between the auction service and all clients.
 */

// ============================================================
// SERVER → CLIENT MESSAGES
// ============================================================

export interface AuctionStateMessage {
  type: 'AUCTION_STATE';
  auction_id: string;
  status: string;
  current_price: string;  // string to avoid floating point issues
  bid_count: number;
  participant_count: number;
  watcher_count: number;
  time_remaining_ms: number | null;
  extended_until: string | null;  // ISO 8601 or null
}

export interface BidAcceptedMessage {
  type: 'BID_ACCEPTED';
  bid_id: string;
  user_id_masked: string;  // privacy: partial ID only
  amount: string;
  server_timestamp: string;
  new_bid_count: number;
}

export interface BidRejectedMessage {
  type: 'BID_REJECTED';
  reason_code: string;
  current_price: string;
  message: string;
}

export interface AuctionExtendedMessage {
  type: 'AUCTION_EXTENDED';
  auction_id: string;
  new_end_time: string;       // ISO 8601 timestamptz
  triggered_by_bid_id: string;
}

export interface AuctionEndingMessage {
  type: 'AUCTION_ENDING';
  time_remaining_ms: number;
}

export interface AuctionEndedMessage {
  type: 'AUCTION_ENDED';
  winner_id_masked: string;
  final_price: string;
}

export interface AuctionSettlementPendingMessage {
  type: 'AUCTION_SETTLEMENT_PENDING';
  auction_id: string;
  manifest_id: string;
  items_total: number;
}

export interface AuctionSettlementProgressMessage {
  type: 'AUCTION_SETTLEMENT_PROGRESS';
  auction_id: string;
  items_total: number;
  items_acknowledged: number;
}

export interface AuctionSettledMessage {
  type: 'AUCTION_SETTLED';
  auction_id: string;
}

export interface AuctionSettlementFailedMessage {
  type: 'AUCTION_SETTLEMENT_FAILED';
  auction_id: string;
}

export type ServerMessage =
  | AuctionStateMessage
  | BidAcceptedMessage
  | BidRejectedMessage
  | AuctionExtendedMessage
  | AuctionEndingMessage
  | AuctionEndedMessage
  | AuctionSettlementPendingMessage
  | AuctionSettlementProgressMessage
  | AuctionSettledMessage
  | AuctionSettlementFailedMessage;

// ============================================================
// CLIENT → SERVER MESSAGES
// ============================================================

export interface PlaceBidMessage {
  type: 'PLACE_BID';
  auction_id: string;
  amount: string;
  reference_price: string;
  idempotency_key: string;
}

export interface JoinAuctionMessage {
  type: 'JOIN_AUCTION';
  auction_id: string;
}

export interface LeaveAuctionMessage {
  type: 'LEAVE_AUCTION';
  auction_id: string;
}

export type ClientMessage =
  | PlaceBidMessage
  | JoinAuctionMessage
  | LeaveAuctionMessage;
