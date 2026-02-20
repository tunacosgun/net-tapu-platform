/**
 * Phase 0 — Auth Security Validation
 *
 * Proves that spoofed x-user-role and x-user-id headers
 * cannot bypass authentication on admin and bid endpoints.
 *
 * Every request must be rejected with 401 (no token) or 403 (no admin role).
 *
 * Prerequisites:
 *   - Auction service running on API_URL
 *
 * Usage:
 *   npx tsx scripts/test-auth-security.ts
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

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

async function main(): Promise<void> {
  console.log('============================================');
  console.log('  Auth Security Validation');
  console.log(`  API URL: ${API_URL}`);
  console.log('============================================\n');

  // ── Test 1: Spoofed x-user-role header on admin endpoint ────
  console.log('--- Test 1: Spoofed x-user-role header on admin endpoints ---');

  const adminEndpoints = [
    { method: 'GET', path: '/api/v1/auctions/admin/settlements' },
    { method: 'GET', path: '/api/v1/auctions/admin/finance/summary' },
    { method: 'GET', path: '/api/v1/auctions/admin/finance/deposits' },
    { method: 'GET', path: '/api/v1/auctions/admin/finance/ledger' },
  ];

  for (const endpoint of adminEndpoints) {
    // No token, just spoofed header
    const resp = await fetch(`${API_URL}${endpoint.path}`, {
      method: endpoint.method,
      headers: {
        'x-user-role': 'admin',
        'x-user-id': '00000000-0000-0000-0000-000000000001',
      },
    });

    check(
      `${endpoint.method} ${endpoint.path} rejects spoofed x-user-role`,
      resp.status === 401,
      `status=${resp.status}`,
    );
  }

  // ── Test 2: Spoofed x-user-id header on bid endpoint ────────
  console.log('\n--- Test 2: Spoofed x-user-id header on bid endpoint ---');

  const bidResp = await fetch(`${API_URL}/api/v1/auctions/bids`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': '00000000-0000-0000-0000-000000000001',
      'x-user-role': 'admin',
    },
    body: JSON.stringify({
      auctionId: '00000000-0000-0000-0000-000000000099',
      amount: '10000.00',
      referencePrice: '9500.00',
    }),
  });

  check(
    'POST /bids rejects spoofed x-user-id',
    bidResp.status === 401,
    `status=${bidResp.status}`,
  );

  // ── Test 3: Spoofed x-user-id on auction create ─────────────
  console.log('\n--- Test 3: Spoofed x-user-id on auction create ---');

  const createResp = await fetch(`${API_URL}/api/v1/auctions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': '00000000-0000-0000-0000-000000000001',
      'x-user-role': 'admin',
    },
    body: JSON.stringify({
      parcelId: '00000000-0000-0000-0000-000000000002',
      title: 'Spoofed Auction',
      startingPrice: '100000.00',
      minimumIncrement: '1000.00',
      requiredDeposit: '10000.00',
      scheduledStart: new Date(Date.now() + 86400000).toISOString(),
      scheduledEnd: new Date(Date.now() + 172800000).toISOString(),
      depositDeadline: new Date(Date.now() + 43200000).toISOString(),
    }),
  });

  check(
    'POST /auctions rejects spoofed x-user-id',
    createResp.status === 401,
    `status=${createResp.status}`,
  );

  // ── Test 4: Invalid JWT token ───────────────────────────────
  console.log('\n--- Test 4: Invalid/expired JWT tokens ---');

  const invalidTokenResp = await fetch(`${API_URL}/api/v1/auctions/admin/settlements`, {
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZXMiOlsiYWRtaW4iXSwiZXhwIjoxfQ.fake_signature',
    },
  });

  check(
    'Invalid JWT signature is rejected',
    invalidTokenResp.status === 401,
    `status=${invalidTokenResp.status}`,
  );

  // ── Test 5: No auth at all ──────────────────────────────────
  console.log('\n--- Test 5: No authentication at all ---');

  const noAuthResp = await fetch(`${API_URL}/api/v1/auctions/admin/settlements`);

  check(
    'No auth header returns 401',
    noAuthResp.status === 401,
    `status=${noAuthResp.status}`,
  );

  // ── Test 6: Public endpoints still work ─────────────────────
  console.log('\n--- Test 6: Public endpoints remain accessible ---');

  const healthResp = await fetch(`${API_URL}/api/v1/auctions/health`);
  check('Health endpoint accessible', healthResp.status === 200, `status=${healthResp.status}`);

  const listResp = await fetch(`${API_URL}/api/v1/auctions`);
  check('Auction listing accessible', listResp.status === 200, `status=${listResp.status}`);

  // ── Summary ─────────────────────────────────────────────────
  console.log('\n============================================');
  console.log(`  RESULT: ${passedChecks}/${totalChecks} checks passed`);
  console.log(passedChecks === totalChecks ? '  ALL CHECKS PASSED' : '  SOME CHECKS FAILED');
  console.log('============================================\n');

  process.exit(passedChecks === totalChecks ? 0 : 1);
}

main().catch((err) => {
  console.error('Security test failed:', err);
  process.exit(1);
});
