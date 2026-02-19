/**
 * Phase 12 — Ledger Integrity Validator
 *
 * Scans the entire payments system for financial integrity:
 *   - Every captured deposit has exactly 1 DEPOSIT_CAPTURED ledger event
 *   - Every refunded deposit has 1 INITIATED + 1 REFUNDED
 *   - No negative balances
 *   - Sum(refunds + captures) = sum(initial deposits) for settled auctions
 *
 * Exit non-zero on invariant violation.
 *
 * Usage:
 *   npx ts-node scripts/validate-ledger-integrity.ts
 *   AUCTION_ID=<uuid> npx ts-node scripts/validate-ledger-integrity.ts
 */

import { Client } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://nettapu_app:nettapu_app_pass@localhost:5432/nettapu';
const AUCTION_ID = process.env.AUCTION_ID;

let totalChecks = 0;
let passedChecks = 0;
let violations = 0;

function check(label: string, condition: boolean, detail?: string): void {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  PASS: ${label}${detail ? ` (${detail})` : ''}`);
  } else {
    violations++;
    console.log(`  FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function info(label: string, detail: string): void {
  console.log(`  INFO: ${label}: ${detail}`);
}

async function main(): Promise<void> {
  console.log('============================================');
  console.log('  Ledger Integrity Validator');
  console.log(`  Scope: ${AUCTION_ID ? `Auction ${AUCTION_ID}` : 'All settled auctions'}`);
  console.log('============================================\n');

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  const auctionFilter = AUCTION_ID
    ? `AND d.auction_id = '${AUCTION_ID}'`
    : `AND d.auction_id IN (SELECT id FROM auctions.auctions WHERE status IN ('settled', 'settlement_failed'))`;

  // ── 1. Captured deposits → exactly 1 DEPOSIT_CAPTURED ledger ──
  console.log('--- Check 1: Captured Deposits vs Ledger ---');

  const capturedDeposits = await db.query(
    `SELECT d.id, d.amount, d.auction_id
     FROM payments.deposits d
     WHERE d.status = 'captured' ${auctionFilter}`,
  );

  info('Captured deposits', `${capturedDeposits.rows.length}`);

  for (const dep of capturedDeposits.rows) {
    const ledgerResult = await db.query(
      `SELECT COUNT(*) as cnt FROM payments.payment_ledger
       WHERE deposit_id = $1 AND event = 'deposit_captured'`,
      [dep.id],
    );
    const count = parseInt(ledgerResult.rows[0].cnt);
    if (count !== 1) {
      check(
        `Deposit ${dep.id.slice(0, 8)}… DEPOSIT_CAPTURED count`,
        false,
        `expected=1, actual=${count}`,
      );
    }
  }

  if (capturedDeposits.rows.length > 0) {
    const mismatch = await db.query(
      `SELECT d.id
       FROM payments.deposits d
       LEFT JOIN payments.payment_ledger pl ON pl.deposit_id = d.id AND pl.event = 'deposit_captured'
       WHERE d.status = 'captured' ${auctionFilter}
       GROUP BY d.id
       HAVING COUNT(pl.id) != 1`,
    );
    check('All captured deposits have exactly 1 DEPOSIT_CAPTURED entry', mismatch.rows.length === 0, `mismatches=${mismatch.rows.length}`);
  }

  // ── 2. Refunded deposits → 1 INITIATED + 1 REFUNDED ──────
  console.log('\n--- Check 2: Refunded Deposits vs Ledger ---');

  const refundedDeposits = await db.query(
    `SELECT d.id, d.amount, d.auction_id
     FROM payments.deposits d
     WHERE d.status = 'refunded' ${auctionFilter}`,
  );

  info('Refunded deposits', `${refundedDeposits.rows.length}`);

  if (refundedDeposits.rows.length > 0) {
    const missingInitiated = await db.query(
      `SELECT d.id
       FROM payments.deposits d
       LEFT JOIN payments.payment_ledger pl ON pl.deposit_id = d.id AND pl.event = 'deposit_refund_initiated'
       WHERE d.status = 'refunded' ${auctionFilter}
       GROUP BY d.id
       HAVING COUNT(pl.id) = 0`,
    );
    check('All refunded deposits have DEPOSIT_REFUND_INITIATED', missingInitiated.rows.length === 0, `missing=${missingInitiated.rows.length}`);

    const missingRefunded = await db.query(
      `SELECT d.id
       FROM payments.deposits d
       LEFT JOIN payments.payment_ledger pl ON pl.deposit_id = d.id AND pl.event = 'deposit_refunded'
       WHERE d.status = 'refunded' ${auctionFilter}
       GROUP BY d.id
       HAVING COUNT(pl.id) = 0`,
    );
    check('All refunded deposits have DEPOSIT_REFUNDED', missingRefunded.rows.length === 0, `missing=${missingRefunded.rows.length}`);

    const dupRefundLedger = await db.query(
      `SELECT d.id, COUNT(pl.id) as cnt
       FROM payments.deposits d
       JOIN payments.payment_ledger pl ON pl.deposit_id = d.id AND pl.event = 'deposit_refunded'
       WHERE d.status = 'refunded' ${auctionFilter}
       GROUP BY d.id
       HAVING COUNT(pl.id) > 1`,
    );
    check('No duplicate DEPOSIT_REFUNDED entries', dupRefundLedger.rows.length === 0, `duplicates=${dupRefundLedger.rows.length}`);
  }

  // ── 3. No negative ledger amounts ─────────────────────────
  console.log('\n--- Check 3: No Negative Amounts ---');

  const negativeAmounts = await db.query(
    `SELECT id, deposit_id, event, amount
     FROM payments.payment_ledger
     WHERE amount::numeric < 0`,
  );
  check('No negative ledger amounts', negativeAmounts.rows.length === 0, `negative_entries=${negativeAmounts.rows.length}`);

  // ── 4. Per-auction balance: captures + refunds = total deposits ─
  console.log('\n--- Check 4: Per-Auction Financial Balance ---');

  const settledAuctions = AUCTION_ID
    ? await db.query(`SELECT id FROM auctions.auctions WHERE id = $1 AND status = 'settled'`, [AUCTION_ID])
    : await db.query(`SELECT id FROM auctions.auctions WHERE status = 'settled'`);

  info('Settled auctions to check', `${settledAuctions.rows.length}`);

  let balanceMismatches = 0;

  for (const auction of settledAuctions.rows) {
    const deposits = await db.query(
      `SELECT COALESCE(SUM(amount::numeric), 0) as total FROM payments.deposits WHERE auction_id = $1`,
      [auction.id],
    );
    const captured = await db.query(
      `SELECT COALESCE(SUM(amount::numeric), 0) as total FROM payments.deposits WHERE auction_id = $1 AND status = 'captured'`,
      [auction.id],
    );
    const refunded = await db.query(
      `SELECT COALESCE(SUM(amount::numeric), 0) as total FROM payments.deposits WHERE auction_id = $1 AND status = 'refunded'`,
      [auction.id],
    );

    const totalDep = parseFloat(deposits.rows[0].total);
    const totalCap = parseFloat(captured.rows[0].total);
    const totalRef = parseFloat(refunded.rows[0].total);
    const accounted = totalCap + totalRef;

    if (Math.abs(totalDep - accounted) > 0.01) {
      balanceMismatches++;
      console.log(`  FAIL: Auction ${auction.id.slice(0, 8)}… balance mismatch: total=${totalDep}, captured=${totalCap}, refunded=${totalRef}, unaccounted=${(totalDep - accounted).toFixed(2)}`);
    }
  }

  check(
    'All settled auctions have balanced financials',
    balanceMismatches === 0,
    `mismatches=${balanceMismatches}/${settledAuctions.rows.length}`,
  );

  // ── 5. Deposit transitions consistency ────────────────────
  console.log('\n--- Check 5: Transition Consistency ---');

  const orphanTransitions = await db.query(
    `SELECT dt.id, dt.deposit_id
     FROM payments.deposit_transitions dt
     LEFT JOIN payments.deposits d ON d.id = dt.deposit_id
     WHERE d.id IS NULL`,
  );
  check('No orphan transitions', orphanTransitions.rows.length === 0, `orphans=${orphanTransitions.rows.length}`);

  const orphanLedger = await db.query(
    `SELECT pl.id, pl.deposit_id
     FROM payments.payment_ledger pl
     LEFT JOIN payments.deposits d ON d.id = pl.deposit_id
     WHERE pl.deposit_id IS NOT NULL AND d.id IS NULL`,
  );
  check('No orphan ledger entries', orphanLedger.rows.length === 0, `orphans=${orphanLedger.rows.length}`);

  // ── Summary ───────────────────────────────────────────────
  console.log('\n============================================');
  console.log(`  RESULT: ${passedChecks}/${totalChecks} checks passed`);
  if (violations > 0) {
    console.log(`  ${violations} INVARIANT VIOLATIONS DETECTED`);
  } else {
    console.log('  ALL INVARIANTS HOLD');
  }
  console.log('============================================\n');

  await db.end();
  process.exit(violations === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Ledger integrity check failed:', err);
  process.exit(1);
});
