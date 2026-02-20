/**
 * Shared test data utilities for settlement load/chaos scripts.
 *
 * Creates minimal parent records (users, parcels) and test auctions
 * with participants and deposits in the correct states for settlement testing.
 */

import { Client } from 'pg';
import { randomUUID } from 'crypto';

export const DEFAULT_DB_URL =
  'postgres://nettapu_app:nettapu_app_pass@localhost:5432/nettapu';

export interface TestAuction {
  auctionId: string;
  winnerId: string;
  losers: string[];
  depositIds: string[];
  participantCount: number;
}

export interface TestSetup {
  auctions: TestAuction[];
  testUserId: string;
  testParcelId: string;
}

/**
 * Sets a hard process timeout that kills the process with exit code 2
 * if the test hangs past the expected duration. Prevents silent poll
 * timeout followed by misleading zero-result validation.
 */
export function installHardTimeout(timeoutMs: number, label: string): void {
  const timer = setTimeout(() => {
    console.error(`\n  TIMEOUT: ${label} exceeded hard limit of ${timeoutMs}ms — aborting`);
    // eslint-disable-next-line no-process-exit
    process.exit(2);
  }, timeoutMs);
  // Allow the process to exit naturally if the test finishes before the timeout
  if (typeof timer === 'object' && typeof timer.unref === 'function') {
    timer.unref();
  }
}

/**
 * Logs process memory usage (RSS and heap) for leak detection.
 */
export function logMemoryUsage(phase: string): void {
  const mem = process.memoryUsage();
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
  console.log(`  MEM [${phase}]: RSS=${mb(mem.rss)}MB, heapUsed=${mb(mem.heapUsed)}MB, heapTotal=${mb(mem.heapTotal)}MB`);
}

let totalChecks = 0;
let passedChecks = 0;

export function check(label: string, condition: boolean, detail?: string): boolean {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  PASS: ${label}${detail ? ` (${detail})` : ''}`);
  } else {
    console.log(`  FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  }
  return condition;
}

export function info(label: string, detail: string): void {
  console.log(`  INFO: ${label}: ${detail}`);
}

export function getResults(): { total: number; passed: number } {
  return { total: totalChecks, passed: passedChecks };
}

export function resetResults(): void {
  totalChecks = 0;
  passedChecks = 0;
}

/**
 * Create a test user in auth.users. Returns the user's UUID.
 */
export async function ensureTestUser(db: Client): Promise<string> {
  const testEmail = 'settlement-load-test@nettapu.com';
  const existing = await db.query(
    `SELECT id FROM auth.users WHERE email = $1`,
    [testEmail],
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const id = randomUUID();
  await db.query(
    `INSERT INTO auth.users (id, email, password_hash, first_name, last_name)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, testEmail, 'no_login_test_hash', 'Settlement', 'TestBot'],
  );
  return id;
}

/**
 * Create a test parcel in listings.parcels. Returns the parcel's UUID.
 */
export async function ensureTestParcel(db: Client, createdBy: string): Promise<string> {
  const listingId = 'NT-TEST-SETTLE-001';
  const existing = await db.query(
    `SELECT id FROM listings.parcels WHERE listing_id = $1`,
    [listingId],
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const id = randomUUID();
  await db.query(
    `INSERT INTO listings.parcels (id, listing_id, title, city, district, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, listingId, 'Settlement Test Parcel', 'Istanbul', 'Kadikoy', createdBy],
  );
  return id;
}

/**
 * Create N test auctions in ENDED state, each with M participants
 * and their deposits in HELD state.
 */
export async function createTestAuctions(
  db: Client,
  parcelId: string,
  createdBy: string,
  auctionCount: number,
  participantsPerAuction: number,
): Promise<TestAuction[]> {
  const results: TestAuction[] = [];

  for (let a = 0; a < auctionCount; a++) {
    const auctionId = randomUUID();
    const winnerId = randomUUID();
    const losers: string[] = [];
    const depositIds: string[] = [];

    // Create user records for all participants
    const userIds = [winnerId];
    for (let p = 1; p < participantsPerAuction; p++) {
      const loserId = randomUUID();
      losers.push(loserId);
      userIds.push(loserId);
    }

    // Batch insert users
    for (const uid of userIds) {
      const email = `test-${uid.slice(0, 8)}@nettapu.com`;
      await db.query(
        `INSERT INTO auth.users (id, email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO NOTHING`,
        [uid, email, 'test_hash', 'Test', `User_${uid.slice(0, 8)}`],
      );
    }

    // Insert auction in ENDED state (trigger is BEFORE UPDATE only, INSERT is fine)
    const depositAmount = '10000.00';
    await db.query(
      `INSERT INTO auctions.auctions
       (id, parcel_id, title, status, starting_price, minimum_increment,
        current_price, currency, required_deposit, final_price,
        winner_id, deposit_deadline, scheduled_start, scheduled_end,
        actual_start, ended_at, bid_count, participant_count, created_by)
       VALUES ($1, $2, $3, 'ended', $4, $5, $6, 'TRY', $7, $8, $9,
               NOW() - interval '2 hours',
               NOW() - interval '1 hour',
               NOW() - interval '10 minutes',
               NOW() - interval '1 hour',
               NOW() - interval '5 minutes',
               $10, $11, $12)`,
      [
        auctionId,
        parcelId,
        `Load Test Auction ${a + 1}`,
        depositAmount,                          // starting_price
        '500.00',                               // minimum_increment
        (parseFloat(depositAmount) + 500 * participantsPerAuction).toFixed(2), // current_price
        depositAmount,                          // required_deposit
        (parseFloat(depositAmount) + 500 * participantsPerAuction).toFixed(2), // final_price
        winnerId,
        participantsPerAuction,                 // bid_count (approximate)
        participantsPerAuction,                 // participant_count
        createdBy,
      ],
    );

    // Create deposits and participants for each user
    for (const uid of userIds) {
      const depositId = randomUUID();
      depositIds.push(depositId);

      await db.query(
        `INSERT INTO payments.deposits
         (id, user_id, auction_id, amount, currency, status, payment_method, idempotency_key)
         VALUES ($1, $2, $3, $4, 'TRY', 'held', 'credit_card', $5)`,
        [depositId, uid, auctionId, depositAmount, `test-dep:${auctionId}:${uid}`],
      );

      await db.query(
        `INSERT INTO auctions.auction_participants
         (id, auction_id, user_id, deposit_id, eligible, registered_at)
         VALUES ($1, $2, $3, $4, true, NOW() - interval '2 hours')`,
        [randomUUID(), auctionId, uid, depositId],
      );
    }

    results.push({
      auctionId,
      winnerId,
      losers,
      depositIds,
      participantCount: participantsPerAuction,
    });
  }

  return results;
}

/**
 * Wait for all auctions to reach a terminal settlement state.
 */
export async function waitForSettlements(
  db: Client,
  auctionIds: string[],
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  const placeholders = auctionIds.map((_, i) => `$${i + 1}`).join(', ');

  while (Date.now() - start < timeoutMs) {
    const result = await db.query(
      `SELECT COUNT(*) as cnt FROM auctions.auctions
       WHERE id IN (${placeholders})
       AND status IN ('settled', 'settlement_failed')`,
      auctionIds,
    );

    if (parseInt(result.rows[0].cnt) === auctionIds.length) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/**
 * Clean up test data created by load tests.
 *
 * payments.payment_ledger and payments.deposit_transitions are append-only
 * (protected by prevent_modification trigger in migration 012). They cannot
 * be deleted. payments.deposits cannot be deleted either because those
 * append-only tables reference them via FK.
 *
 * This is safe because:
 *   - CI uses ephemeral databases (destroyed after each job)
 *   - deposits.auction_id has no FK constraint (no cross-schema FK),
 *     so auctions can be deleted independently
 *   - Orphaned payment records don't affect future test runs
 */
export async function cleanupTestAuctions(
  db: Client,
  auctionIds: string[],
): Promise<void> {
  if (auctionIds.length === 0) return;

  const placeholders = auctionIds.map((_, i) => `$${i + 1}`).join(', ');

  // payments.refunds: deletable (not append-only), FK to deposits is safe
  // since we are NOT deleting the parent deposits row
  await db.query(`DELETE FROM payments.refunds WHERE deposit_id IN (SELECT id FROM payments.deposits WHERE auction_id IN (${placeholders}))`, auctionIds);

  // Skip: payments.payment_ledger    (append-only — trigger blocks DELETE)
  // Skip: payments.deposit_transitions (append-only — trigger blocks DELETE)
  // Skip: payments.deposits           (FK from append-only tables prevents DELETE)

  // Auction-side tables: all deletable
  await db.query(`DELETE FROM auctions.auction_participants WHERE auction_id IN (${placeholders})`, auctionIds);
  await db.query(`DELETE FROM auctions.settlement_manifests WHERE auction_id IN (${placeholders})`, auctionIds);
  await db.query(`DELETE FROM auctions.bids WHERE auction_id IN (${placeholders})`, auctionIds);
  await db.query(`DELETE FROM auctions.auctions WHERE id IN (${placeholders})`, auctionIds);
}
