/**
 * Phase 12 — High-Concurrency Settlement Simulation
 *
 * Spawns N parallel ENDED auctions (default 20) with M participants each (default 15).
 * Waits for SettlementWorker to process them all, then validates:
 *   - No duplicate capture/refund
 *   - All auctions reach SETTLED
 *   - Ledger entries count matches expected
 *   - Throughput metrics
 *
 * Prerequisites:
 *   - Auction service running
 *   - PostgreSQL accessible
 *
 * Usage:
 *   npx ts-node scripts/test-settlement-load.ts
 *   AUCTION_COUNT=50 PARTICIPANTS=20 npx ts-node scripts/test-settlement-load.ts
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
const AUCTION_COUNT = parseInt(process.env.AUCTION_COUNT || '20', 10);
const PARTICIPANTS = parseInt(process.env.PARTICIPANTS || '15', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '120000', 10);

async function main(): Promise<void> {
  console.log('============================================');
  console.log('  High-Concurrency Settlement Load Test');
  console.log(`  Auctions: ${AUCTION_COUNT}`);
  console.log(`  Participants per auction: ${PARTICIPANTS}`);
  console.log(`  Timeout: ${TIMEOUT_MS / 1000}s`);
  console.log('============================================\n');

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  // Setup
  const testUser = await ensureTestUser(db);
  const testParcel = await ensureTestParcel(db, testUser);

  console.log('Creating test auctions...');
  const startCreate = Date.now();
  const auctions = await createTestAuctions(db, testParcel, testUser, AUCTION_COUNT, PARTICIPANTS);
  const createDuration = Date.now() - startCreate;
  info('Test data created', `${auctions.length} auctions, ${auctions.length * PARTICIPANTS} participants in ${createDuration}ms`);

  const auctionIds = auctions.map((a) => a.auctionId);

  // Wait for settlement
  console.log('\nWaiting for SettlementWorker to process...');
  const startSettle = Date.now();
  await waitForSettlements(db, auctionIds, TIMEOUT_MS);
  const settleDuration = Date.now() - startSettle;
  info('Settlement duration', `${settleDuration}ms`);

  // ── Validation ─────────────────────────────────────────────
  console.log('\n--- Settlement State ---');

  const statusResult = await db.query(
    `SELECT status, COUNT(*) as cnt FROM auctions.auctions
     WHERE id = ANY($1) GROUP BY status`,
    [auctionIds],
  );

  for (const row of statusResult.rows) {
    info(`Status ${row.status}`, row.cnt);
  }

  const settledCount = statusResult.rows.find((r: { status: string }) => r.status === 'settled')?.cnt ?? 0;
  check('All auctions settled', parseInt(settledCount) === AUCTION_COUNT, `${settledCount}/${AUCTION_COUNT}`);

  // ── No duplicate captures ─────────────────────────────────
  console.log('\n--- Duplicate Detection ---');

  const dupCaptureResult = await db.query(
    `SELECT d.id, COUNT(*) as cnt
     FROM payments.deposit_transitions dt
     JOIN payments.deposits d ON d.id = dt.deposit_id
     WHERE d.auction_id = ANY($1) AND dt.event = 'DEPOSIT_CAPTURED'
     GROUP BY d.id HAVING COUNT(*) > 1`,
    [auctionIds],
  );
  check('No duplicate captures', dupCaptureResult.rows.length === 0, `duplicates=${dupCaptureResult.rows.length}`);

  const dupRefundResult = await db.query(
    `SELECT d.id, COUNT(*) as cnt
     FROM payments.deposit_transitions dt
     JOIN payments.deposits d ON d.id = dt.deposit_id
     WHERE d.auction_id = ANY($1) AND dt.event = 'DEPOSIT_REFUNDED'
     GROUP BY d.id HAVING COUNT(*) > 1`,
    [auctionIds],
  );
  check('No duplicate refunds', dupRefundResult.rows.length === 0, `duplicates=${dupRefundResult.rows.length}`);

  // ── Manifest uniqueness ───────────────────────────────────
  const manifestCountResult = await db.query(
    `SELECT auction_id, COUNT(*) as cnt
     FROM auctions.settlement_manifests
     WHERE auction_id = ANY($1)
     GROUP BY auction_id HAVING COUNT(*) > 1`,
    [auctionIds],
  );
  check('No duplicate manifests', manifestCountResult.rows.length === 0);

  // ── Deposit states ────────────────────────────────────────
  console.log('\n--- Deposit States ---');

  const depositStates = await db.query(
    `SELECT status, COUNT(*) as cnt
     FROM payments.deposits WHERE auction_id = ANY($1)
     GROUP BY status`,
    [auctionIds],
  );

  for (const row of depositStates.rows) {
    info(`Deposits ${row.status}`, row.cnt);
  }

  const expectedCaptures = AUCTION_COUNT; // 1 winner per auction
  const expectedRefunds = AUCTION_COUNT * (PARTICIPANTS - 1);

  const capturedCount = parseInt(depositStates.rows.find((r: { status: string }) => r.status === 'captured')?.cnt ?? '0');
  const refundedCount = parseInt(depositStates.rows.find((r: { status: string }) => r.status === 'refunded')?.cnt ?? '0');

  check('Captured deposit count', capturedCount === expectedCaptures, `${capturedCount}/${expectedCaptures}`);
  check('Refunded deposit count', refundedCount === expectedRefunds, `${refundedCount}/${expectedRefunds}`);

  // ── Ledger entries ────────────────────────────────────────
  console.log('\n--- Ledger Entries ---');

  const ledgerCounts = await db.query(
    `SELECT pl.event, COUNT(*) as cnt
     FROM payments.payment_ledger pl
     JOIN payments.deposits d ON d.id = pl.deposit_id
     WHERE d.auction_id = ANY($1)
     GROUP BY pl.event`,
    [auctionIds],
  );

  for (const row of ledgerCounts.rows) {
    info(`Ledger ${row.event}`, row.cnt);
  }

  const capturedLedger = parseInt(ledgerCounts.rows.find((r: { event: string }) => r.event === 'DEPOSIT_CAPTURED')?.cnt ?? '0');
  const refundedLedger = parseInt(ledgerCounts.rows.find((r: { event: string }) => r.event === 'DEPOSIT_REFUNDED')?.cnt ?? '0');

  check('Ledger DEPOSIT_CAPTURED matches', capturedLedger === expectedCaptures, `${capturedLedger}/${expectedCaptures}`);
  check('Ledger DEPOSIT_REFUNDED matches', refundedLedger === expectedRefunds, `${refundedLedger}/${expectedRefunds}`);

  // ── Throughput ─────────────────────────────────────────────
  console.log('\n--- Throughput ---');

  const totalItems = AUCTION_COUNT * PARTICIPANTS;
  const itemsPerSec = (totalItems / (settleDuration / 1000)).toFixed(1);
  const avgPerAuction = (settleDuration / AUCTION_COUNT).toFixed(0);

  info('Total items processed', `${totalItems}`);
  info('Items/sec', itemsPerSec);
  info('Avg ms per auction', avgPerAuction);
  info('Total POS calls', `${totalItems}`);

  // ── Cleanup ───────────────────────────────────────────────
  console.log('\nCleaning up test data...');
  await cleanupTestAuctions(db, auctionIds);

  // ── Summary ───────────────────────────────────────────────
  const { total, passed } = getResults();
  console.log('\n============================================');
  console.log(`  RESULT: ${passed}/${total} checks passed`);
  console.log(passed === total ? '  ALL CHECKS PASSED' : '  SOME CHECKS FAILED');
  console.log('============================================\n');

  await db.end();
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
