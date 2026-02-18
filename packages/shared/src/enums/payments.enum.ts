export enum DepositStatus {
  COLLECTED = 'collected',
  HELD = 'held',
  CAPTURED = 'captured',
  REFUND_PENDING = 'refund_pending',
  REFUNDED = 'refunded',
  EXPIRED = 'expired',
}

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
}

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  BANK_TRANSFER = 'bank_transfer',
  MAIL_ORDER = 'mail_order',
}

export enum PosProvider {
  PAYTR = 'paytr',
  IYZICO = 'iyzico',
  MOKA = 'moka',
}

export enum LedgerEvent {
  DEPOSIT_COLLECTED = 'deposit_collected',
  DEPOSIT_HELD = 'deposit_held',
  DEPOSIT_CAPTURED = 'deposit_captured',
  DEPOSIT_REFUND_INITIATED = 'deposit_refund_initiated',
  DEPOSIT_REFUNDED = 'deposit_refunded',
  DEPOSIT_EXPIRED = 'deposit_expired',
  PAYMENT_INITIATED = 'payment_initiated',
  PAYMENT_COMPLETED = 'payment_completed',
  PAYMENT_FAILED = 'payment_failed',
  REFUND_INITIATED = 'refund_initiated',
  REFUND_COMPLETED = 'refund_completed',
}
