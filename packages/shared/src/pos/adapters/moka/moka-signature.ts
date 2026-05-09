import { createHash, timingSafeEqual } from 'crypto';

/**
 * Generate Moka CheckKey (auth hash).
 *
 * Formula:
 *   raw = DealerCode + MD5(Password) + Username + ShaIndex
 *   CheckKey = SHA256(raw) hex
 *
 * Reference: Moka API docs — every request must carry this in
 * PaymentDealerAuthentication.CheckKey.
 */
export function generateMokaCheckKey(
  dealerCode: string,
  username: string,
  password: string,
  shaIndex: string,
): string {
  const passwordHash = createHash('md5').update(password).digest('hex');
  const raw = dealerCode + passwordHash + username + shaIndex;
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Verify hashValue posted by Moka in 3DS callback.
 *
 * Formula:
 *   raw = OtherTrxCode + DealerCode + Amount + ResultCode + ShaIndex
 *   expected = SHA256(raw) hex
 *
 * Falls back to false on any field missing.
 */
export function verifyMokaCallbackHash(
  otherTrxCode: string,
  dealerCode: string,
  amount: string,
  resultCode: string,
  shaIndex: string,
  receivedHash: string,
): boolean {
  if (!otherTrxCode || !dealerCode || !amount || !resultCode || !shaIndex || !receivedHash) {
    return false;
  }

  const raw = otherTrxCode + dealerCode + amount + resultCode + shaIndex;
  const expected = createHash('sha256').update(raw).digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(receivedHash, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
