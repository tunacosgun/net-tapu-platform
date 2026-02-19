/**
 * Phase 12 — Oversized Manifest Memory Guard Test
 *
 * Creates an auction with >600 participants to trigger the
 * memory safety guard (MEMORY_SAFETY_ITEMS_LIMIT = 500).
 * Validates:
 *   - Worker escalates immediately
 *   - Auction transitions to SETTLEMENT_FAILED
 *   - settlementFailedTotal increments
 *
 * Prerequisites:
 *   - Auction service running
 *   - PostgreSQL accessible
 *
 * Usage:
 *   npx ts-node scripts/test-memory-guard.ts
 *   PARTICIPANT_COUNT=650 npx ts-node scripts/test-memory-guard.ts
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
const API_URL = process.env.API_URL || 'http://localhost:3001';
const PARTICIPANT_COUNT = parseInt(process.env.PARTICIPANT_COUNT || '601', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '60000', 10);

async function main(): Promise<void> {
  console.log('============================================');
  console.log('  Memory Safety Guard Test');
  console.log(`  Participants: ${PARTICIPANT_COUNT} (limit=500)`);
  console.log('============================================\n');

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  // Snapshot metrics
  let failedBefore = 0;
  try {
    const resp = await fetch(`${API_URL}/metrics`);
    const text = await resp.text();
    const match = text.match(/settlement_failed_total(?:\{[^}]*\})?\s+([\d.]+)/);
    failedBefore = match ? parseFloat(match[1]) : 0;
  } catch {
    // Metrics endpoint may not be available
  }

  const testUser = await ensureTestUser(db);
  const testParcel = await ensureTestParcel(db, testUser);

  // Create a single oversized auction
  const auctionId = randomUUID();
  const winnerId = randomUUID();

  console.log(`Creating auction with ${PARTICIPANT_COUNT} participants...`);
  const startCreate = Date.now();

  // Create all users in batch
  const userIds = [winnerId];
  for (let i = 1; i < PARTICIPANT_COUNT; i++) {
    userIds.push(randomUUID());
  }

  // Batch insert users (in chunks to avoid query size limits)
  const CHUNK_SIZE = 100;
  for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + CHUNK_SIZE);
    const values = chunk.map((uid, idx) =>
      `('${uid}', 'memtest-${uid.slice(0, 8)}@nettapu.com', 'test_hash', 'Test', 'User${idx}')`,
    ).join(', ');
    await db.query(
      `INSERT INTO auth.users (id, email, password_hash, first_name, last_name)
       VALUES ${values}
       ON CONFLICT (email) DO NOTHING`,
    );
  }

  // Create auction
  await db.query(
    `INSERT INTO auctions.auctions
     (id, parcel_id, title, status, starting_price, minimum_increment,
      currency, required_deposit, final_price, winner_id,
      deposit_deadline, scheduled_start, scheduled_end, actual_start, ended_at,
      bid_count, participant_count, created_by)
     VALUES ($1, $2, 'Memory Guard Test Auction', 'ended', '10000.00', '500.00',
             'TRY', '10000.00', '15000.00', $3,
             NOW() - interval '2 hours', NOW() - interval '1 hour',
             NOW() - interval '10 minutes', NOW() - interval '1 hour',
             NOW() - interval '5 minutes', $4, $4, $5)`,
    [auctionId, testParcel, winnerId, PARTICIPANT_COUNT, testUser],
  );

  // Create deposits and participants in batches
  for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + CHUNK_SIZE);

    for (const uid of chunk) {
      const depositId = randomUUID();

      await db.query(
        `INSERT INTO payments.deposits
         (id, user_id, auction_id, amount, currency, status, payment_method, idempotency_key)
         VALUES ($1, $2, $3, '10000.00', 'TRY', 'held', 'credit_card', $4)`,
        [depositId, uid, auctionId, `memguard-dep:${auctionId}:${uid}`],
      );

      await db.query(
        `INSERT INTO auctions.auction_participants
         (id, auction_id, user_id, deposit_id, eligible, registered_at)
         VALUES ($1, $2, $3, $4, true, NOW() - interval '2 hours')`,
        [randomUUID(), auctionId, uid, depositId],
      );
    }
  }

  const createDuration = Date.now() - startCreate;
  info('Test data created', `${PARTICIPANT_COUNT} participants in ${createDuration}ms`);

  // Wait for settlement worker to process
  console.log('\nWaiting for memory guard to trigger...');
  const start = Date.now();

  let finalStatus = '';
  while (Date.now() - start < TIMEOUT_MS) {
    const result = await db.query(
      `SELECT status FROM auctions.auctions WHERE id = $1`,
      [auctionId],
    );
    finalStatus = result.rows[0]?.status ?? '';

    if (finalStatus === 'settlement_failed' || finalStatus === 'settled') break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const duration = Date.now() - start;
  info('Detection time', `${duration}ms`);

  // ── Validation ─────────────────────────────────────────────
  console.log('\n--- Validation ---');

  check('Auction escalated to settlement_failed', finalStatus === 'settlement_failed', `actual=${finalStatus}`);

  // Check manifest was escalated
  const manifestResult = await db.query(
    `SELECT status, items_total, items_acknowledged, manifest_data
     FROM auctions.settlement_manifests WHERE auction_id = $1`,
    [auctionId],
  );

  if (manifestResult.rows.length > 0) {
    const manifest = manifestResult.rows[0];
    check('Manifest exists', true);
    check('Manifest status is escalated', manifest.status === 'escalated', `actual=${manifest.status}`);
    check('Items total matches participant count', manifest.items_total === PARTICIPANT_COUNT, `${manifest.items_total}/${PARTICIPANT_COUNT}`);

    // Memory guard should escalate BEFORE processing items
    check(
      'No items were processed (immediate escalation)',
      manifest.items_acknowledged === 0,
      `acknowledged=${manifest.items_acknowledged}`,
    );
  } else {
    check('Manifest exists', false, 'not found');
  }

  // Check settlement_metadata
  const auctionResult = await db.query(
    `SELECT settlement_metadata FROM auctions.auctions WHERE id = $1`,
    [auctionId],
  );
  const metadata = auctionResult.rows[0]?.settlement_metadata;
  if (metadata) {
    check(
      'settlement_metadata mentions memory safety',
      typeof metadata.reason === 'string' && metadata.reason.includes('Memory safety'),
      metadata.reason,
    );
  }

  // Check deposits are still in held state (not processed)
  const heldDeposits = await db.query(
    `SELECT COUNT(*) as cnt FROM payments.deposits
     WHERE auction_id = $1 AND status = 'held'`,
    [auctionId],
  );
  check(
    'All deposits still in held state',
    parseInt(heldDeposits.rows[0].cnt) === PARTICIPANT_COUNT,
    `held=${heldDeposits.rows[0].cnt}/${PARTICIPANT_COUNT}`,
  );

  // Check metrics
  try {
    const resp = await fetch(`${API_URL}/metrics`);
    const text = await resp.text();
    const match = text.match(/settlement_failed_total(?:\{[^}]*\})?\s+([\d.]+)/);
    const failedAfter = match ? parseFloat(match[1]) : 0;
    check('settlement_failed_total incremented', failedAfter > failedBefore, `before=${failedBefore}, after=${failedAfter}`);
  } catch {
    info('Metrics', 'endpoint not available — skipping metric check');
  }

  // ── Cleanup ───────────────────────────────────────────────
  console.log('\nCleaning up...');
  await cleanupTestAuctions(db, [auctionId]);

  const { total, passed } = getResults();
  console.log('\n============================================');
  console.log(`  RESULT: ${passed}/${total} checks passed`);
  console.log(passed === total ? '  ALL CHECKS PASSED' : '  SOME CHECKS FAILED');
  console.log('============================================\n');

  await db.end();
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('Memory guard test failed:', err);
  process.exit(1);
});
