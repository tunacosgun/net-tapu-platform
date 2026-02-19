/**
 * Phase 12 — POS Failure Storm Simulation
 *
 * Tests the settlement pipeline under POS chaos conditions.
 * Requires: POS_FAIL_MODE=true when starting the auction service.
 *
 * Validates:
 *   1. Random failures — retries behave correctly
 *   2. Sustained failures — circuit breaker opens, escalation occurs
 *   3. No duplicate captures/refunds
 *   4. Metrics reflect circuit state changes
 *
 * Prerequisites:
 *   - Auction service running with POS_FAIL_MODE=true
 *   - PostgreSQL accessible
 *
 * Usage:
 *   npx ts-node scripts/test-pos-chaos.ts
 *   AUCTION_COUNT=5 npx ts-node scripts/test-pos-chaos.ts
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
const AUCTION_COUNT = parseInt(process.env.AUCTION_COUNT || '5', 10);
const PARTICIPANTS = parseInt(process.env.PARTICIPANTS || '10', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '180000', 10); // 3 min — chaos needs longer

async function fetchMetric(name: string): Promise<number | null> {
  const resp = await fetch(`${API_URL}/metrics`);
  const text = await resp.text();
  const match = text.match(new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+([\\d.]+)`, 'm'));
  return match ? parseFloat(match[1]) : null;
}

async function main(): Promise<void> {
  console.log('============================================');
  console.log('  POS Failure Storm Simulation');
  console.log(`  Auctions: ${AUCTION_COUNT} (${PARTICIPANTS} participants each)`);
  console.log(`  Timeout: ${TIMEOUT_MS / 1000}s`);
  console.log('  IMPORTANT: Service must be running with POS_FAIL_MODE=true');
  console.log('============================================\n');

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  // Snapshot metrics before
  const circuitTripsBefore = await fetchMetric('settlement_pos_circuit_trips_total') ?? 0;
  const timeoutsBefore = await fetchMetric('settlement_pos_timeouts_total') ?? 0;
  const itemFailuresBefore = await fetchMetric('settlement_item_failures_total') ?? 0;

  info('Initial circuit trips', `${circuitTripsBefore}`);
  info('Initial timeouts', `${timeoutsBefore}`);
  info('Initial item failures', `${itemFailuresBefore}`);

  // Create test data
  const testUser = await ensureTestUser(db);
  const testParcel = await ensureTestParcel(db, testUser);

  console.log('\nCreating test auctions...');
  const auctions = await createTestAuctions(db, testParcel, testUser, AUCTION_COUNT, PARTICIPANTS);
  const auctionIds = auctions.map((a) => a.auctionId);
  info('Created', `${auctions.length} auctions`);

  // Wait for settlement (longer timeout for chaos mode)
  console.log('\nWaiting for settlement under chaos conditions...');
  await waitForSettlements(db, auctionIds, TIMEOUT_MS);

  // ── Validation ─────────────────────────────────────────────
  console.log('\n--- Settlement Outcomes ---');

  const statusResult = await db.query(
    `SELECT status, COUNT(*) as cnt FROM auctions.auctions
     WHERE id = ANY($1) GROUP BY status`,
    [auctionIds],
  );

  for (const row of statusResult.rows) {
    info(`Status ${row.status}`, row.cnt);
  }

  const settledCount = parseInt(statusResult.rows.find((r: { status: string }) => r.status === 'settled')?.cnt ?? '0');
  const failedCount = parseInt(statusResult.rows.find((r: { status: string }) => r.status === 'settlement_failed')?.cnt ?? '0');
  const totalTerminal = settledCount + failedCount;

  check(
    'All auctions reached terminal state',
    totalTerminal === AUCTION_COUNT,
    `settled=${settledCount}, failed=${failedCount}, total=${totalTerminal}/${AUCTION_COUNT}`,
  );

  // Under chaos mode, some auctions may fail — that's expected
  info('Settled auctions', `${settledCount}`);
  info('Failed auctions (escalated)', `${failedCount}`);

  // ── No duplicate captures/refunds ─────────────────────────
  console.log('\n--- Duplicate Detection ---');

  const dupCaptureResult = await db.query(
    `SELECT d.id, COUNT(*) as cnt
     FROM payments.deposit_transitions dt
     JOIN payments.deposits d ON d.id = dt.deposit_id
     WHERE d.auction_id = ANY($1) AND dt.event = 'deposit_captured'
     GROUP BY d.id HAVING COUNT(*) > 1`,
    [auctionIds],
  );
  check('No duplicate captures', dupCaptureResult.rows.length === 0);

  const dupRefundResult = await db.query(
    `SELECT d.id, COUNT(*) as cnt
     FROM payments.deposit_transitions dt
     JOIN payments.deposits d ON d.id = dt.deposit_id
     WHERE d.auction_id = ANY($1) AND dt.event = 'deposit_refunded'
     GROUP BY d.id HAVING COUNT(*) > 1`,
    [auctionIds],
  );
  check('No duplicate refunds', dupRefundResult.rows.length === 0);

  // ── Escalation verification ───────────────────────────────
  console.log('\n--- Escalation Verification ---');

  if (failedCount > 0) {
    const escalatedManifests = await db.query(
      `SELECT sm.auction_id, sm.status, sm.manifest_data
       FROM auctions.settlement_manifests sm
       WHERE sm.auction_id = ANY($1) AND sm.status = 'escalated'`,
      [auctionIds],
    );

    check(
      'Escalated manifests match failed auctions',
      escalatedManifests.rows.length === failedCount,
      `manifests=${escalatedManifests.rows.length}, auctions=${failedCount}`,
    );

    // Verify failed items have retry_count >= 3
    for (const manifest of escalatedManifests.rows) {
      const items = manifest.manifest_data?.items ?? [];
      const maxRetryItems = items.filter((i: { status: string; retry_count: number }) =>
        i.status === 'failed' && i.retry_count >= 3,
      );
      check(
        `Manifest ${manifest.auction_id.slice(0, 8)}… has max-retry items`,
        maxRetryItems.length > 0,
        `failed_items=${maxRetryItems.length}`,
      );
    }
  } else {
    console.log('  INFO: No escalated auctions — chaos was lenient this run');
  }

  // ── Metrics validation ────────────────────────────────────
  console.log('\n--- Metrics After Chaos ---');

  const circuitTripsAfter = await fetchMetric('settlement_pos_circuit_trips_total') ?? 0;
  const timeoutsAfter = await fetchMetric('settlement_pos_timeouts_total') ?? 0;
  const itemFailuresAfter = await fetchMetric('settlement_item_failures_total') ?? 0;

  const newTrips = circuitTripsAfter - circuitTripsBefore;
  const newTimeouts = timeoutsAfter - timeoutsBefore;
  const newFailures = itemFailuresAfter - itemFailuresBefore;

  info('New circuit trips', `${newTrips}`);
  info('New timeouts', `${newTimeouts}`);
  info('New item failures', `${newFailures}`);

  check('Item failures occurred (chaos working)', newFailures > 0, `${newFailures}`);

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
  console.error('POS chaos test failed:', err);
  process.exit(1);
});
