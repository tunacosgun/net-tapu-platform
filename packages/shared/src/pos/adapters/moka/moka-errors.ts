// ── Moka Result Code Mapping ────────────────────────────
// Subset of common Moka result codes. Full list in Moka docs.

const MOKA_ERROR_MAP: Record<string, string> = {
  PaymentDealer_DoDirectPayment3dRequest_DealerAuthenticationFailed:
    'Moka authentication failed (check DealerCode/Username/Password)',
  PaymentDealer_DoDirectPayment3dRequest_AmountInvalid: 'Invalid amount',
  PaymentDealer_DoDirectPayment3dRequest_CardNumberInvalid: 'Invalid card number',
  PaymentDealer_DoDirectPayment3dRequest_CvcInvalid: 'Invalid CVC',
  PaymentDealer_DoDirectPayment3dRequest_ExpInvalid: 'Invalid expiration date',
  PaymentDealer_DoDirectPayment3dRequest_DealerNotFound: 'Dealer not found',
  PaymentDealer_DoDirectPayment3dRequest_InsufficientLimit: 'Insufficient card limit',
  PaymentDealer_DoDirectPayment3dRequest_OtherTrxCodeAlreadyExists:
    'Duplicate OtherTrxCode (idempotency violation)',
  PaymentDealer_DoVoid_AlreadyVoided: 'Transaction already voided',
  PaymentDealer_DoRefund_AlreadyRefunded: 'Transaction already refunded',
  PaymentDealer_DoRefund_AmountExceedsOriginal: 'Refund amount exceeds original',
};

export function mapMokaResultCode(code: string | undefined, fallbackMessage?: string): string {
  if (!code) return fallbackMessage || 'Unknown Moka error';
  return MOKA_ERROR_MAP[code] || fallbackMessage || `Moka result code: ${code}`;
}

export class MokaApiError extends Error {
  constructor(
    message: string,
    public readonly resultCode?: string,
    public readonly rawResponse?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MokaApiError';
  }
}
