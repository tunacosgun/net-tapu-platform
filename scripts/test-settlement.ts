/**
 * Phase 9 Settlement Verification Script
 *
 * Connects to DB and WebSocket to verify the settlement pipeline:
 *   1. Finds an ENDED auction (or uses AUCTION_ID env var)
 *   2. Subscribes to settlement WS events
 *   3. Waits for SettlementWorker to process
 *   4. Verifies:
 *      - Manifest created with correct item count
 *      - Each manifest item matches its deposit's final state
 *      - Winner deposit: held → captured
 *      - Loser deposits: held → refund_pending → refunded
 *      - Payment ledger entries match transitions
 *      - Refund records created for losers
 *      - Auction status = SETTLED
 *      - settlement_metadata populated
 *      - No-bid auction: empty manifest → immediate SETTLED
 *      - UNIQUE constraint prevents duplicate manifests
 *
 * Prerequisites:
 *   - Auction service running on WS_URL (default: http://localhost:3001)
 *   - PostgreSQL accessible at DATABASE_URL
 *   - An ENDED auction with participants and held deposits
 *
 * Usage:
 *   AUCTION_ID=<uuid> npx ts-node scripts/test-settlement.ts
 *   DATABASE_URL=postgres://... npx ts-node scripts/test-settlement.ts
 */

import { io, Socket } from 'socket.io-client';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { Client } from 'pg';

const WS_URL = process.env.WS_URL || 'http://localhost:3001';
const WS_PATH = '/ws/auction';
const JWT_SECRET =
  process.env.JWT_SECRET || 'change_me_in_production_min_32_chars!!';
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://nettapu_app:nettapu_app_pass@localhost:5432/nettapu';
const AUCTION_ID = process.env.AUCTION_ID;
const TIMEOUT_MS = 30_000;

interface SettlementEvents {
  settlementPending: any[];
  settlementProgress: any[];
  settled: any[];
  settlementFailed: any[];
}

const events: SettlementEvents = {
  settlementPending: [],
  settlementProgress: [],
  settled: [],
  settlementFailed: [],
};

let totalChecks = 0;
let passedChecks = 0;

function check(label: string, condition: boolean, detail?: string): boolean {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  PASS: ${label}${detail ? ` (${detail})` : ''}`);
  } else {
    console.log(`  FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  }
  return condition;
}

function info(label: string, detail: string): void {
  console.log(`  INFO: ${label}: ${detail}`);
}

async function findEndedAuction(db: Client): Promise<string> {
  if (AUCTION_ID) return AUCTION_ID;

  // Look for ENDED auction first, then SETTLING/SETTLED (already picked up by worker)
  const result = await db.query(
    `SELECT id, status FROM auctions.auctions
     WHERE status IN ('ended', 'settling', 'settled', 'settlement_failed')
     ORDER BY
       CASE status
         WHEN 'ended' THEN 1
         WHEN 'settling' THEN 2
         WHEN 'settled' THEN 3
         WHEN 'settlement_failed' THEN 4
       END,
       ended_at DESC
     LIMIT 1`,
  );

  if (result.rows.length === 0) {
    console.error('ERROR: No ENDED/SETTLING/SETTLED auction found.');
    console.error('Set AUCTION_ID or create an ended auction with participants.');
    process.exit(1);
  }

  console.log(`Found auction ${result.rows[0].id} (status=${result.rows[0].status})`);
  return result.rows[0].id;
}

function createWsClient(auctionId: string): Promise<Socket> {
  const token = jwt.sign(
    {
      sub: randomUUID(),
      email: 'settlement-test@nettapu.com',
      roles: ['admin'],
    },
    JWT_SECRET,
    { expiresIn: '15m' },
  );

  return new Promise((resolve, reject) => {
    const socket = io(WS_URL, {
      path: WS_PATH,
      transports: ['websocket'],
      auth: { token },
      timeout: 10000,
    });

    socket.on('connect', () => {
      socket.emit('join_auction', { auctionId });
    });

    socket.on('auction_state', () => {
      resolve(socket);
    });

    socket.on('auction_settlement_pending', (data: any) => {
      events.settlementPending.push(data);
      console.log('  [WS] SETTLEMENT_PENDING:', JSON.stringify(data));
    });

    socket.on('auction_settlement_progress', (data: any) => {
      events.settlementProgress.push(data);
      console.log('  [WS] SETTLEMENT_PROGRESS:', JSON.stringify(data));
    });

    socket.on('auction_settled', (data: any) => {
      events.settled.push(data);
      console.log('  [WS] AUCTION_SETTLED:', JSON.stringify(data));
    });

    socket.on('auction_settlement_failed', (data: any) => {
      events.settlementFailed.push(data);
      console.log('  [WS] SETTLEMENT_FAILED:', JSON.stringify(data));
    });

    socket.on('connect_error', (err: Error) => {
      reject(new Error(`WebSocket connection failed: ${err.message}`));
    });

    setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
  });
}

async function waitForSettlement(): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    if (events.settled.length > 0 || events.settlementFailed.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function verifyDbState(db: Client, auctionId: string): Promise<boolean> {
  // ── 1. Auction status ──────────────────────────────────────────
  console.log('\n--- Auction State ---');
  const auctionResult = await db.query(
    `SELECT status, winner_id, final_price, settlement_metadata
     FROM auctions.auctions WHERE id = $1`,
    [auctionId],
  );
  const auction = auctionResult.rows[0];

  if (!auction) {
    console.log('  FAIL: Auction not found');
    return false;
  }

  info('Status', auction.status);
  info('Winner', auction.winner_id ?? 'none');
  info('Final price', auction.final_price ?? 'none');

  const isTerminal = ['settled', 'settlement_failed'].includes(auction.status);
  check(
    'Auction reached terminal settlement state',
    isTerminal,
    `current=${auction.status}`,
  );

  if (auction.status === 'settled') {
    check(
      'settlement_metadata populated on completion',
      auction.settlement_metadata != null &&
        typeof auction.settlement_metadata === 'object' &&
        'manifest_id' in auction.settlement_metadata,
      JSON.stringify(auction.settlement_metadata)?.slice(0, 100),
    );
  }

  // ── 2. Settlement manifest ─────────────────────────────────────
  console.log('\n--- Settlement Manifest ---');
  const manifestResult = await db.query(
    `SELECT id, status, items_total, items_acknowledged, manifest_data, completed_at, expired_at
     FROM auctions.settlement_manifests WHERE auction_id = $1`,
    [auctionId],
  );
  const manifest = manifestResult.rows[0];

  check('Manifest exists', manifest != null);
  if (!manifest) return false;

  info('Manifest ID', manifest.id);
  info('Status', manifest.status);
  info('Items', `${manifest.items_acknowledged}/${manifest.items_total} acknowledged`);

  if (auction.status === 'settled') {
    check('Manifest status is completed', manifest.status === 'completed');
    check('Manifest completed_at is set', manifest.completed_at != null);
    check(
      'All items acknowledged',
      manifest.items_acknowledged === manifest.items_total,
      `${manifest.items_acknowledged}/${manifest.items_total}`,
    );
  }

  // ── 3. UNIQUE constraint (no duplicate manifests) ──────────────
  const manifestCountResult = await db.query(
    `SELECT COUNT(*) as cnt FROM auctions.settlement_manifests WHERE auction_id = $1`,
    [auctionId],
  );
  check(
    'No duplicate manifests (UNIQUE constraint)',
    parseInt(manifestCountResult.rows[0].cnt) === 1,
    `count=${manifestCountResult.rows[0].cnt}`,
  );

  // ── 4. Manifest items vs deposit states ────────────────────────
  console.log('\n--- Manifest Items vs Deposits ---');
  const manifestData = manifest.manifest_data;
  const items = manifestData?.items ?? [];

  // Load all deposits for this auction
  const depositsResult = await db.query(
    `SELECT d.id, d.user_id, d.status, d.amount, d.currency
     FROM payments.deposits d
     WHERE d.auction_id = $1
     ORDER BY d.created_at ASC`,
    [auctionId],
  );
  const depositMap = new Map<string, any>();
  for (const d of depositsResult.rows) {
    depositMap.set(d.id, d);
  }

  for (const item of items) {
    const deposit = depositMap.get(item.deposit_id);
    const isWinner = item.action === 'capture';
    const expectedDepositStatus = isWinner ? 'captured' : 'refunded';

    if (item.status === 'acknowledged' && deposit) {
      check(
        `Deposit ${item.deposit_id.slice(0, 8)}… [${item.action}] → ${deposit.status}`,
        deposit.status === expectedDepositStatus,
        `expected=${expectedDepositStatus}, actual=${deposit.status}`,
      );
    } else {
      info(
        `Deposit ${item.deposit_id.slice(0, 8)}…`,
        `item_status=${item.status}, deposit_status=${deposit?.status ?? 'NOT_FOUND'}, retries=${item.retry_count}`,
      );
    }
  }

  // ── 5. Deposit transitions audit trail ─────────────────────────
  console.log('\n--- Deposit Transitions ---');
  const transitionsResult = await db.query(
    `SELECT dt.deposit_id, dt.from_status, dt.to_status, dt.event, dt.metadata
     FROM payments.deposit_transitions dt
     JOIN payments.deposits d ON d.id = dt.deposit_id
     WHERE d.auction_id = $1
     ORDER BY dt.created_at ASC`,
    [auctionId],
  );

  info('Total transitions', `${transitionsResult.rows.length}`);
  for (const t of transitionsResult.rows) {
    console.log(`    ${t.deposit_id.slice(0, 8)}… ${t.from_status} → ${t.to_status} (${t.event})`);
  }

  // Winner should have exactly 1 transition: held → captured
  if (auction.winner_id) {
    const winnerTransitions = transitionsResult.rows.filter(
      (t: any) => depositMap.get(t.deposit_id)?.user_id === auction.winner_id,
    );
    if (auction.status === 'settled') {
      check(
        'Winner has DEPOSIT_CAPTURED transition',
        winnerTransitions.some((t: any) => t.event === 'DEPOSIT_CAPTURED'),
        `transitions=${winnerTransitions.length}`,
      );
    }

    // Losers should have 2 transitions: held→refund_pending, refund_pending→refunded
    const loserDeposits = depositsResult.rows.filter(
      (d: any) => d.user_id !== auction.winner_id,
    );
    for (const ld of loserDeposits) {
      const lt = transitionsResult.rows.filter((t: any) => t.deposit_id === ld.id);
      if (auction.status === 'settled') {
        check(
          `Loser ${ld.id.slice(0, 8)}… has refund initiation + completion`,
          lt.some((t: any) => t.event === 'DEPOSIT_REFUND_INITIATED') &&
          lt.some((t: any) => t.event === 'DEPOSIT_REFUNDED'),
          `transitions=${lt.map((t: any) => t.event).join(', ')}`,
        );
      }
    }
  }

  // ── 6. Payment ledger ──────────────────────────────────────────
  console.log('\n--- Payment Ledger ---');
  const ledgerResult = await db.query(
    `SELECT pl.deposit_id, pl.event, pl.amount, pl.currency, pl.metadata
     FROM payments.payment_ledger pl
     JOIN payments.deposits d ON d.id = pl.deposit_id
     WHERE d.auction_id = $1
     ORDER BY pl.created_at ASC`,
    [auctionId],
  );

  info('Total ledger entries', `${ledgerResult.rows.length}`);
  for (const l of ledgerResult.rows) {
    console.log(`    ${l.deposit_id.slice(0, 8)}… ${l.event} ${l.amount} ${l.currency}`);
  }

  if (auction.status === 'settled' && items.length > 0) {
    // Each acknowledged item should have at least one ledger entry
    const ledgerDepositIds = new Set(ledgerResult.rows.map((l: any) => l.deposit_id));
    const acknowledgedItems = items.filter((i: any) => i.status === 'acknowledged');
    check(
      'Every acknowledged item has ledger entries',
      acknowledgedItems.every((i: any) => ledgerDepositIds.has(i.deposit_id)),
      `${acknowledgedItems.length} items, ${ledgerDepositIds.size} deposits in ledger`,
    );

    // Idempotency keys should be present in metadata
    const hasIdempotencyKeys = ledgerResult.rows.every(
      (l: any) => l.metadata?.idempotencyKey != null,
    );
    check(
      'All ledger entries have idempotencyKey in metadata',
      hasIdempotencyKeys,
    );
  }

  // ── 7. Refund records ──────────────────────────────────────────
  console.log('\n--- Refund Records ---');
  const refundsResult = await db.query(
    `SELECT r.deposit_id, r.status, r.amount, r.pos_refund_id, r.idempotency_key,
            r.initiated_at, r.completed_at
     FROM payments.refunds r
     JOIN payments.deposits d ON d.id = r.deposit_id
     WHERE d.auction_id = $1
     ORDER BY r.initiated_at ASC`,
    [auctionId],
  );

  info('Total refund records', `${refundsResult.rows.length}`);
  for (const r of refundsResult.rows) {
    console.log(
      `    ${r.deposit_id.slice(0, 8)}… status=${r.status} amount=${r.amount} ` +
      `pos_ref=${r.pos_refund_id ?? 'null'} completed=${r.completed_at ? 'yes' : 'no'}`,
    );
  }

  if (auction.status === 'settled') {
    const refundItems = items.filter((i: any) => i.action === 'refund' && i.status === 'acknowledged');
    check(
      'Refund record count matches refund items',
      refundsResult.rows.length === refundItems.length,
      `records=${refundsResult.rows.length}, items=${refundItems.length}`,
    );

    if (refundsResult.rows.length > 0) {
      check(
        'All refund records are completed',
        refundsResult.rows.every((r: any) => r.status === 'completed'),
      );
      check(
        'All refund records have completed_at',
        refundsResult.rows.every((r: any) => r.completed_at != null),
      );
    }
  }

  // ── 8. No-bid auction check ────────────────────────────────────
  if (items.length === 0 && manifest.status === 'completed') {
    console.log('\n--- No-Bid Auction ---');
    check(
      'Empty manifest (no-bid) finalized correctly',
      manifest.items_total === 0 && manifest.items_acknowledged === 0,
    );
  }

  return true;
}

async function main(): Promise<void> {
  console.log('============================================');
  console.log('  Settlement Pipeline Verification');
  console.log(`  WS URL:     ${WS_URL}`);
  console.log(`  DB:         ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`  Timeout:    ${TIMEOUT_MS / 1000}s`);
  console.log('============================================\n');

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  const auctionId = await findEndedAuction(db);
  console.log(`Target auction: ${auctionId}\n`);

  // Check initial state
  const initialStatus = await db.query(
    `SELECT status FROM auctions.auctions WHERE id = $1`,
    [auctionId],
  );
  console.log(`Initial status: ${initialStatus.rows[0]?.status}`);

  let socket: Socket | null = null;

  if (initialStatus.rows[0]?.status === 'ended') {
    // Only connect WS if settlement hasn't started yet
    try {
      console.log('Connecting to WebSocket...');
      socket = await createWsClient(auctionId);
      console.log('Connected. Waiting for settlement events...\n');
      await waitForSettlement();
    } catch (err) {
      console.log(`WebSocket: ${(err as Error).message} (continuing with DB verification)\n`);
    }
  } else {
    console.log('Auction already past ENDED — skipping WS wait, verifying DB state.\n');
  }

  // Verify DB state regardless of WS success
  console.log('============================================');
  console.log('  DATABASE VERIFICATION');
  console.log('============================================');

  await verifyDbState(db, auctionId);

  console.log('\n============================================');
  console.log('  WS EVENTS SUMMARY');
  console.log('============================================');
  console.log(`  Settlement pending:   ${events.settlementPending.length}`);
  console.log(`  Settlement progress:  ${events.settlementProgress.length}`);
  console.log(`  Settled:              ${events.settled.length}`);
  console.log(`  Settlement failed:    ${events.settlementFailed.length}`);

  console.log('\n============================================');
  console.log(`  RESULT: ${passedChecks}/${totalChecks} checks passed`);
  const allPassed = passedChecks === totalChecks;
  console.log(allPassed ? '  ALL CHECKS PASSED' : '  SOME CHECKS FAILED');
  console.log('============================================\n');

  // Cleanup
  if (socket) socket.disconnect();
  await db.end();
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
