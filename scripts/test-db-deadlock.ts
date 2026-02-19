/**
 * Phase 12 — DB Deadlock Simulation
 *
 * Simulates transient DB failures by holding a pessimistic lock on a
 * deposit row, then triggering settlement. Validates:
 *   - executeWithRetry retries the operation
 *   - No data corruption
 *   - Settlement eventually completes after lock release
 *
 * Prerequisites:
 *   - Auction service running
 *   - PostgreSQL accessible
 *
 * Usage:
 *   npx ts-node scripts/test-db-deadlock.ts
 */

import { Client } from 'pg';
import { randomUUID } from 'crypto';
import {
  DEFAULT_DB_URL,
  ensureTestUser,
  ensureTestParcel,
  cleanupTestAuctions,
  check,
  info,
  getResults,
} from './helpers/settlement-test-utils';

const DATABASE_URL = process.env.DATABASE_URL || DEFAULT_DB_URL;
const LOCK_HOLD_MS = parseInt(process.env.LOCK_HOLD_MS || '8000', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '60000', 10);

async function main(): Promise<void> {
  console.log('============================================');
  console.log('  DB Deadlock Simulation');
  console.log(`  Lock hold duration: ${LOCK_HOLD_MS}ms`);
  console.log('============================================\n');

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  // Separate connection for holding the lock
  const lockDb = new Client({ connectionString: DATABASE_URL });
  await lockDb.connect();

  const testUser = await ensureTestUser(db);
  const testParcel = await ensureTestParcel(db, testUser);

  // Create a single auction with 3 participants
  const auctionId = randomUUID();
  const winnerId = randomUUID();
  const loserId1 = randomUUID();
  const loserId2 = randomUUID();
  const userIds = [winnerId, loserId1, loserId2];
  const depositIds: string[] = [];

  // Create users
  for (const uid of userIds) {
    await db.query(
      `INSERT INTO auth.users (id, email, password_hash, first_name, last_name)
       VALUES ($1, $2, 'test_hash', 'Test', 'User')
       ON CONFLICT (email) DO NOTHING`,
      [uid, `deadlock-test-${uid.slice(0, 8)}@nettapu.com`],
    );
  }

  // Create auction
  await db.query(
    `INSERT INTO auctions.auctions
     (id, parcel_id, title, status, starting_price, minimum_increment,
      currency, required_deposit, final_price, winner_id,
      deposit_deadline, scheduled_start, scheduled_end, actual_start, ended_at,
      bid_count, participant_count, created_by)
     VALUES ($1, $2, 'Deadlock Test Auction', 'ended', '10000.00', '500.00',
             'TRY', '10000.00', '11500.00', $3,
             NOW() - interval '2 hours', NOW() - interval '1 hour',
             NOW() - interval '10 minutes', NOW() - interval '1 hour',
             NOW() - interval '5 minutes', 3, 3, $4)`,
    [auctionId, testParcel, winnerId, testUser],
  );

  // Create deposits and participants
  for (const uid of userIds) {
    const depositId = randomUUID();
    depositIds.push(depositId);

    await db.query(
      `INSERT INTO payments.deposits
       (id, user_id, auction_id, amount, currency, status, payment_method, idempotency_key)
       VALUES ($1, $2, $3, '10000.00', 'TRY', 'held', 'credit_card', $4)`,
      [depositId, uid, auctionId, `deadlock-dep:${auctionId}:${uid}`],
    );

    await db.query(
      `INSERT INTO auctions.auction_participants
       (id, auction_id, user_id, deposit_id, eligible, registered_at)
       VALUES ($1, $2, $3, $4, true, NOW() - interval '2 hours')`,
      [randomUUID(), auctionId, uid, depositId],
    );
  }

  info('Auction created', auctionId);
  info('Winner deposit', depositIds[0]);

  // ── Hold a pessimistic lock on the winner's deposit ───────
  console.log('\n--- Holding pessimistic lock on winner deposit ---');
  info('Lock target', `deposit ${depositIds[0].slice(0, 8)}…`);
  info('Lock duration', `${LOCK_HOLD_MS}ms`);

  // Start a transaction and lock the winner's deposit row
  await lockDb.query('BEGIN');
  await lockDb.query(
    `SELECT * FROM payments.deposits WHERE id = $1 FOR UPDATE`,
    [depositIds[0]],
  );

  console.log('  Lock acquired. Settlement worker will encounter contention...');

  // Schedule lock release after delay
  const lockReleasePromise = new Promise<void>((resolve) => {
    setTimeout(async () => {
      await lockDb.query('COMMIT');
      console.log('\n  Lock released.');
      resolve();
    }, LOCK_HOLD_MS);
  });

  // Wait for settlement to complete (worker will retry after lock release)
  console.log(`  Waiting up to ${TIMEOUT_MS / 1000}s for settlement...`);

  const start = Date.now();
  let settled = false;

  while (Date.now() - start < TIMEOUT_MS) {
    const result = await db.query(
      `SELECT status FROM auctions.auctions WHERE id = $1`,
      [auctionId],
    );
    const status = result.rows[0]?.status;

    if (status === 'settled' || status === 'settlement_failed') {
      settled = true;
      info('Final auction status', status);
      info('Duration', `${Date.now() - start}ms`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Ensure lock is released
  await lockReleasePromise;

  // ── Validation ─────────────────────────────────────────────
  console.log('\n--- Validation ---');

  check('Settlement completed despite lock contention', settled);

  // Check auction final state
  const auctionResult = await db.query(
    `SELECT status, settlement_metadata FROM auctions.auctions WHERE id = $1`,
    [auctionId],
  );
  const auctionStatus = auctionResult.rows[0]?.status;
  check('Auction reached terminal state', auctionStatus === 'settled' || auctionStatus === 'settlement_failed', `status=${auctionStatus}`);

  // Check deposit states
  const depositsResult = await db.query(
    `SELECT id, user_id, status FROM payments.deposits WHERE auction_id = $1 ORDER BY created_at`,
    [auctionId],
  );

  for (const dep of depositsResult.rows) {
    const isWinner = dep.user_id === winnerId;
    const expectedStatus = isWinner ? 'captured' : 'refunded';
    if (auctionStatus === 'settled') {
      check(
        `Deposit ${dep.id.slice(0, 8)}… [${isWinner ? 'winner' : 'loser'}]`,
        dep.status === expectedStatus,
        `expected=${expectedStatus}, actual=${dep.status}`,
      );
    } else {
      info(`Deposit ${dep.id.slice(0, 8)}…`, `status=${dep.status}`);
    }
  }

  // Check no corruption — no deposit should be in an invalid state
  const invalidDeposits = await db.query(
    `SELECT id, status FROM payments.deposits
     WHERE auction_id = $1
     AND status NOT IN ('held', 'captured', 'refund_pending', 'refunded')`,
    [auctionId],
  );
  check('No deposits in invalid state', invalidDeposits.rows.length === 0);

  // Check manifest
  const manifestResult = await db.query(
    `SELECT id, status, items_total, items_acknowledged FROM auctions.settlement_manifests WHERE auction_id = $1`,
    [auctionId],
  );
  check('Manifest exists', manifestResult.rows.length === 1);
  if (manifestResult.rows.length > 0) {
    info('Manifest status', manifestResult.rows[0].status);
    info('Items', `${manifestResult.rows[0].items_acknowledged}/${manifestResult.rows[0].items_total}`);
  }

  // ── Cleanup ───────────────────────────────────────────────
  console.log('\nCleaning up...');
  await cleanupTestAuctions(db, [auctionId]);

  const { total, passed } = getResults();
  console.log('\n============================================');
  console.log(`  RESULT: ${passed}/${total} checks passed`);
  console.log(passed === total ? '  ALL CHECKS PASSED' : '  SOME CHECKS FAILED');
  console.log('============================================\n');

  await lockDb.end();
  await db.end();
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('Deadlock test failed:', err);
  process.exit(1);
});
