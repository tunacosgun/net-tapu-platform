// ── POS Gateway Request / Response Types ─────────────────────

/** Pre-auth hold on a card */
export interface ProvisionRequest {
  paymentId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
  cardToken?: string;
  /**
   * Mail Order / Telephone Order flag — bypasses 3DS, uses MOTO channel
   * on the provider side. Admin-initiated only; never set this for
   * customer-facing flows.
   */
  isMoto?: boolean;
  /** Buyer details required by some providers (iyzico) */
  buyer?: {
    email: string;
    firstName: string;
    lastName: string;
    ip: string;
    phone?: string;
    city?: string;
    country?: string;
    address?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface ProvisionResponse {
  success: boolean;
  posReference: string | null;
  message: string;
}

// ── 3D Secure Two-Phase Provision Types ──────────────────────

export type ProvisionStatus = 'completed' | 'requires_3ds' | 'failed';

/** Returned by initiateProvision() — may require 3DS redirect */
export interface ProvisionInitiationResponse {
  status: ProvisionStatus;
  posReference: string | null;
  message: string;
  /** HTML content to render (iframe/form) for 3DS — PayTR style */
  threeDsHtmlContent?: string;
  /** Direct redirect URL for 3DS — iyzico style */
  threeDsRedirectUrl?: string;
  /** Provider token to correlate callback with this provision */
  posTransactionToken?: string;
}

/** Sent to completeProvision() after callback arrives */
export interface CompleteProvisionRequest {
  paymentId: string;
  posTransactionToken: string;
  callbackPayload: Record<string, unknown>;
  idempotencyKey: string;
}

/** Result of querying a provider for transaction status (reconciliation) */
export interface TransactionStatusResponse {
  found: boolean;
  status: string;
  amount?: string;
  currency?: string;
  posReference?: string;
  rawResponse?: Record<string, unknown>;
}

/** Capture a previously provisioned amount */
export interface CaptureProvisionRequest {
  paymentId: string;
  posReference: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface CaptureProvisionResponse {
  success: boolean;
  posReference: string | null;
  message: string;
}

/** Cancel (release) a provision hold */
export interface CancelProvisionRequest {
  paymentId: string;
  posReference: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface CancelProvisionResponse {
  success: boolean;
  message: string;
}

/** Refund a completed payment (full or partial) */
export interface PosRefundRequest {
  paymentId: string;
  posReference: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface PosRefundResponse {
  success: boolean;
  posRefundReference: string | null;
  message: string;
}
