/**
 * Phase 10 Admin Settlement & Finance API Test Script
 *
 * Tests all admin endpoints:
 *   1. GET /admin/settlements (list)
 *   2. GET /admin/settlements/:id (detail)
 *   3. POST /admin/settlements/:id/retry (if escalated)
 *   4. GET /admin/finance/summary
 *   5. GET /admin/finance/ledger
 *   6. GET /admin/finance/deposits
 *   7. GET /admin/finance/reconciliation/:auctionId
 *
 * Prerequisites:
 *   - Auction service running on API_URL (default: http://localhost:3001)
 *   - At least one settled/settling/failed auction with deposits
 *
 * Usage:
 *   npx ts-node scripts/test-admin-settlement.ts
 *   API_URL=http://localhost:3001 AUCTION_ID=<uuid> npx ts-node scripts/test-admin-settlement.ts
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';
const AUCTION_ID = process.env.AUCTION_ID;

let totalChecks = 0;
let passedChecks = 0;

function check(label: string, condition: boolean, detail?: string): void {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  PASS: ${label}${detail ? ` (${detail})` : ''}`);
  } else {
    console.log(`  FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function info(label: string, detail: string): void {
  console.log(`  INFO: ${label}: ${detail}`);
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<{ status: number; body: T }> {
  const resp = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': 'admin',
      'x-user-id': 'test-admin-user',
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
  const body = await resp.json() as T;
  return { status: resp.status, body };
}

async function testListSettlements(): Promise<string | null> {
  console.log('\n--- GET /admin/settlements ---');

  const { status, body } = await fetchJson<{
    data: Array<{ manifest_id: string; auction_id: string; status: string; items_total: number; items_acknowledged: number }>;
    meta: { total: number };
  }>('/admin/settlements?limit=10');

  check('List settlements returns 200', status === 200);
  check('Response has data array', Array.isArray(body.data));
  check('Response has meta', body.meta != null && typeof body.meta.total === 'number');

  info('Total manifests', `${body.meta?.total ?? 0}`);

  if (body.data?.length > 0) {
    const first = body.data[0];
    check('Manifest has required fields', !!(first.manifest_id && first.auction_id && first.status));
    info('First manifest', `${first.manifest_id} (${first.status})`);
    return first.manifest_id;
  }

  console.log('  WARN: No manifests found — skipping detail tests');
  return null;
}

async function testGetManifest(manifestId: string): Promise<{ auctionId: string; status: string }> {
  console.log('\n--- GET /admin/settlements/:id ---');

  const { status, body } = await fetchJson<{
    manifest_id: string;
    auction_id: string;
    status: string;
    manifest_data: { items: Array<{ item_id: string; action: string; status: string }> };
  }>(`/admin/settlements/${manifestId}`);

  check('Get manifest returns 200', status === 200);
  check('Response has manifest_id', body.manifest_id === manifestId);
  check('Response has manifest_data', body.manifest_data != null);
  check('manifest_data has items', Array.isArray(body.manifest_data?.items));

  info('Auction ID', body.auction_id);
  info('Status', body.status);
  info('Items', `${body.manifest_data?.items?.length ?? 0}`);

  return { auctionId: body.auction_id, status: body.status };
}

async function testRetrySettlement(manifestId: string): Promise<void> {
  console.log('\n--- POST /admin/settlements/:id/retry ---');

  const { status, body } = await fetchJson<{
    manifest_id?: string;
    items_reset?: number;
    message?: string;
    statusCode?: number;
  }>(`/admin/settlements/${manifestId}/retry`, { method: 'POST' });

  if (status === 200) {
    check('Retry returns 200', true);
    check('Response has items_reset', typeof body.items_reset === 'number');
    info('Items reset', `${body.items_reset}`);
  } else if (status === 400) {
    check('Retry correctly rejected (not escalated)', true, body.message);
  } else {
    check('Retry returns expected status', false, `status=${status}, message=${body.message}`);
  }
}

async function testFinanceSummary(): Promise<void> {
  console.log('\n--- GET /admin/finance/summary ---');

  const { status, body } = await fetchJson<{
    total_captured_amount: string;
    total_refunded_amount: string;
    total_settled_auctions: number;
    total_failed_settlements: number;
  }>('/admin/finance/summary');

  check('Finance summary returns 200', status === 200);
  check('Has total_captured_amount', typeof body.total_captured_amount === 'string');
  check('Has total_refunded_amount', typeof body.total_refunded_amount === 'string');
  check('Has total_settled_auctions', typeof body.total_settled_auctions === 'number');
  check('Has total_failed_settlements', typeof body.total_failed_settlements === 'number');

  info('Captured', body.total_captured_amount);
  info('Refunded', body.total_refunded_amount);
  info('Settled auctions', `${body.total_settled_auctions}`);
  info('Failed settlements', `${body.total_failed_settlements}`);
}

async function testLedger(auctionId?: string): Promise<void> {
  console.log('\n--- GET /admin/finance/ledger ---');

  const queryParam = auctionId ? `?auction_id=${auctionId}&limit=10` : '?limit=10';
  const { status, body } = await fetchJson<{
    data: Array<{ id: string; event: string; amount: string; deposit_id: string | null }>;
    meta: { total: number };
  }>(`/admin/finance/ledger${queryParam}`);

  check('Ledger returns 200', status === 200);
  check('Response has data array', Array.isArray(body.data));
  check('Response has meta', body.meta != null);

  info('Total entries', `${body.meta?.total ?? 0}`);

  if (body.data?.length > 0) {
    const first = body.data[0];
    check('Ledger entry has required fields', !!(first.id && first.event && first.amount));
    info('First entry', `${first.event} ${first.amount}`);
  }
}

async function testDeposits(auctionId?: string): Promise<void> {
  console.log('\n--- GET /admin/finance/deposits ---');

  const queryParam = auctionId ? `?auction_id=${auctionId}&limit=10` : '?limit=10';
  const { status, body } = await fetchJson<{
    data: Array<{ id: string; status: string; amount: string; user_id: string }>;
    meta: { total: number };
  }>(`/admin/finance/deposits${queryParam}`);

  check('Deposits returns 200', status === 200);
  check('Response has data array', Array.isArray(body.data));

  info('Total deposits', `${body.meta?.total ?? 0}`);

  if (body.data?.length > 0) {
    const first = body.data[0];
    check('Deposit has required fields', !!(first.id && first.status && first.amount));
    info('First deposit', `${first.id.slice(0, 8)}… ${first.status} ${first.amount}`);
  }
}

async function testReconciliation(auctionId: string): Promise<void> {
  console.log('\n--- GET /admin/finance/reconciliation/:auctionId ---');

  const { status, body } = await fetchJson<{
    auction_id: string;
    auction_status: string;
    pass: boolean;
    checks: Array<{ name: string; pass: boolean; detail: string }>;
  }>(`/admin/finance/reconciliation/${auctionId}`);

  check('Reconciliation returns 200', status === 200);
  check('Response has auction_id', body.auction_id === auctionId);
  check('Response has pass flag', typeof body.pass === 'boolean');
  check('Response has checks array', Array.isArray(body.checks));

  info('Auction status', body.auction_status);
  info('Overall pass', `${body.pass}`);

  if (body.checks) {
    for (const c of body.checks) {
      const icon = c.pass ? 'OK' : 'FAIL';
      console.log(`    [${icon}] ${c.name}: ${c.detail}`);
    }
  }
}

async function testRbac(): Promise<void> {
  console.log('\n--- RBAC: Non-admin access ---');

  const resp = await fetch(`${API_URL}/admin/settlements`, {
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': 'user',
    },
  });

  check('Non-admin gets 403', resp.status === 403);
}

async function main(): Promise<void> {
  console.log('============================================');
  console.log('  Admin Settlement & Finance API Tests');
  console.log(`  API URL: ${API_URL}`);
  console.log('============================================');

  // ── RBAC ──────────────────────────────────────────────────
  await testRbac();

  // ── Settlements ───────────────────────────────────────────
  const manifestId = await testListSettlements();

  let auctionId = AUCTION_ID;
  let manifestStatus: string | undefined;

  if (manifestId) {
    const detail = await testGetManifest(manifestId);
    auctionId = auctionId ?? detail.auctionId;
    manifestStatus = detail.status;

    // Try retry (will succeed if escalated, correctly reject otherwise)
    await testRetrySettlement(manifestId);
  }

  // ── Finance ───────────────────────────────────────────────
  await testFinanceSummary();
  await testLedger(auctionId);
  await testDeposits(auctionId);

  // ── Reconciliation ────────────────────────────────────────
  if (auctionId) {
    await testReconciliation(auctionId);
  } else {
    console.log('\n  SKIP: No auction ID available for reconciliation');
  }

  // ── Summary ───────────────────────────────────────────────
  console.log('\n============================================');
  console.log(`  RESULT: ${passedChecks}/${totalChecks} checks passed`);
  const allPassed = passedChecks === totalChecks;
  console.log(allPassed ? '  ALL CHECKS PASSED' : '  SOME CHECKS FAILED');
  console.log('============================================\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
