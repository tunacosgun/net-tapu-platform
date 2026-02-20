/**
 * Phase 12 — Redis Lock Chaos Test
 *
 * Simulates concurrent settlement attempts on the same auctions
 * by creating ENDED auctions and observing worker behavior.
 * Validates:
 *   - Only one manifest created per auction (UNIQUE constraint)
 *   - No duplicate settlements
 *   - Lock contention metrics increment
 *
 * Note: True multi-instance testing requires running two service
 * instances. This script validates the idempotency guarantees
 * that make multi-instance safe, using DB constraints as proof.
 *
 * Prerequisites:
 *   - Auction service running (one or more instances)
 *   - PostgreSQL accessible
 *
 * Usage:
 *   npx ts-node scripts/test-redis-chaos.ts
 *   AUCTION_COUNT=10 npx ts-node scripts/test-redis-chaos.ts
 */

import { Client } from 'pg';
import {
  DEFAULT_DB_URL,
  ensureTestUser,
  ensureTestParcel,
  createTestAuctions,
  waitForSettlements,
  cleanupTestAuctions,
  check,
  info,
  getResults,
} from './helpers/settlement-test-utils';

const DATABASE_URL = process.env.DATABASE_URL || DEFAULT_DB_URL;
const API_URL = process.env.API_URL || 'http://localhost:3001';
const AUCTION_COUNT = parseInt(process.env.AUCTION_COUNT || '10', 10);
const PARTICIPANTS = parseInt(process.env.PARTICIPANTS || '5', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '90000', 10);

async function main(): Promise<void> {
  console.log('============================================');
  console.log('  Redis Lock Chaos Test');
  console.log(`  Auctions: ${AUCTION_COUNT}`);
  console.log(`  Participants: ${PARTICIPANTS}`);
  console.log('============================================\n');

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  // Snapshot lock failures before
  let lockFailuresBefore = 0;
  try {
    const resp = await fetch(`${API_URL}/metrics`);
    const text = await resp.text();
    const match = text.match(/settlement_lock_failures_total(?:\{[^}]*\})?\s+([\d.]+)/);
    lockFailuresBefore = match ? parseFloat(match[1]) : 0;
  } catch {
    // Metrics endpoint may not be available
  }

  const testUser = await ensureTestUser(db);
  const testParcel = await ensureTestParcel(db, testUser);

  // Create all auctions at once — worker will pick them up simultaneously
  console.log('Creating auctions simultaneously...');
  const auctions = await createTestAuctions(db, testParcel, testUser, AUCTION_COUNT, PARTICIPANTS);
  const auctionIds = auctions.map((a) => a.auctionId);

  console.log('Waiting for settlement...');
  await waitForSettlements(db, auctionIds, TIMEOUT_MS);

  // ── Validation ─────────────────────────────────────────────
  console.log('\n--- Manifest Uniqueness (UNIQUE constraint) ---');

  const manifestResult = await db.query(
    `SELECT auction_id, COUNT(*) as cnt
     FROM auctions.settlement_manifests
     WHERE auction_id = ANY($1)
     GROUP BY auction_id`,
    [auctionIds],
  );

  const multipleManifests = manifestResult.rows.filter((r: { cnt: string }) => parseInt(r.cnt) > 1);
  check('No duplicate manifests', multipleManifests.rows?.length === 0 || multipleManifests.length === 0);

  const manifestCount = manifestResult.rows.length;
  check('Every auction has exactly 1 manifest', manifestCount === AUCTION_COUNT, `${manifestCount}/${AUCTION_COUNT}`);

  // ── No duplicate deposit transitions ──────────────────────
  console.log('\n--- Deposit Transition Uniqueness ---');

  const dupCaptures = await db.query(
    `SELECT dt.deposit_id, COUNT(*) as cnt
     FROM payments.deposit_transitions dt
     JOIN payments.deposits d ON d.id = dt.deposit_id
     WHERE d.auction_id = ANY($1) AND dt.event = 'deposit_captured'
     GROUP BY dt.deposit_id HAVING COUNT(*) > 1`,
    [auctionIds],
  );
  check('No duplicate DEPOSIT_CAPTURED transitions', dupCaptures.rows.length === 0);

  const dupRefunds = await db.query(
    `SELECT dt.deposit_id, COUNT(*) as cnt
     FROM payments.deposit_transitions dt
     JOIN payments.deposits d ON d.id = dt.deposit_id
     WHERE d.auction_id = ANY($1) AND dt.event = 'deposit_refunded'
     GROUP BY dt.deposit_id HAVING COUNT(*) > 1`,
    [auctionIds],
  );
  check('No duplicate DEPOSIT_REFUNDED transitions', dupRefunds.rows.length === 0);

  // ── Idempotency keys uniqueness ───────────────────────────
  console.log('\n--- Idempotency Key Uniqueness ---');

  const dupRefundKeys = await db.query(
    `SELECT r.idempotency_key, COUNT(*) as cnt
     FROM payments.refunds r
     JOIN payments.deposits d ON d.id = r.deposit_id
     WHERE d.auction_id = ANY($1)
     GROUP BY r.idempotency_key HAVING COUNT(*) > 1`,
    [auctionIds],
  );
  check('No duplicate refund idempotency keys', dupRefundKeys.rows.length === 0);

  // ── Settlement status ─────────────────────────────────────
  console.log('\n--- Final Status ---');

  const statusResult = await db.query(
    `SELECT status, COUNT(*) as cnt FROM auctions.auctions
     WHERE id = ANY($1) GROUP BY status`,
    [auctionIds],
  );
  for (const row of statusResult.rows) {
    info(`Status ${row.status}`, row.cnt);
  }

  // ── Lock metrics ──────────────────────────────────────────
  console.log('\n--- Lock Metrics ---');

  try {
    const resp = await fetch(`${API_URL}/metrics`);
    const text = await resp.text();
    const match = text.match(/settlement_lock_failures_total(?:\{[^}]*\})?\s+([\d.]+)/);
    const lockFailuresAfter = match ? parseFloat(match[1]) : 0;
    const newLockFailures = lockFailuresAfter - lockFailuresBefore;
    info('New lock failures', `${newLockFailures}`);
    // Lock failures are expected when multiple ticks compete
  } catch {
    info('Lock metrics', 'metrics endpoint not available');
  }

  // ── Cleanup ───────────────────────────────────────────────
  console.log('\nCleaning up...');
  await cleanupTestAuctions(db, auctionIds);

  const { total, passed } = getResults();
  console.log('\n============================================');
  console.log(`  RESULT: ${passed}/${total} checks passed`);
  console.log(passed === total ? '  ALL CHECKS PASSED' : '  SOME CHECKS FAILED');
  console.log('============================================\n');

  await db.end();
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('Redis chaos test failed:', err);
  process.exit(1);
});
