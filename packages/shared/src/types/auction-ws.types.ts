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

export interface AuctionEndingMessage {
  type: 'AUCTION_ENDING';
  time_remaining_ms: number;
}

export interface AuctionEndedMessage {
  type: 'AUCTION_ENDED';
  winner_id_masked: string;
  final_price: string;
}

export type ServerMessage =
  | AuctionStateMessage
  | BidAcceptedMessage
  | BidRejectedMessage
  | AuctionEndingMessage
  | AuctionEndedMessage;

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
