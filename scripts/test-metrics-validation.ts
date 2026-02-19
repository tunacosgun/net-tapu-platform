/**
 * Phase 12 — Metrics Validation Script
 *
 * Fetches GET /metrics and validates all Phase 11 hardening metrics exist.
 * Optionally validates metric values under chaos conditions.
 *
 * Prerequisites:
 *   - Auction service running
 *
 * Usage:
 *   npx ts-node scripts/test-metrics-validation.ts
 *   API_URL=http://localhost:3001 npx ts-node scripts/test-metrics-validation.ts
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
  console.log('  Metrics Validation');
  console.log(`  API URL: ${API_URL}`);
  console.log('============================================\n');

  const resp = await fetch(`${API_URL}/metrics`);
  check('Metrics endpoint returns 200', resp.status === 200, `status=${resp.status}`);

  const text = await resp.text();

  // ── Required metrics existence ────────────────────────────
  console.log('\n--- Phase 9-10 Settlement Metrics ---');

  const phase9Metrics = [
    'settlement_initiated_total',
    'settlement_completed_total',
    'settlement_failed_total',
    'settlement_expired_total',
    'settlement_captures_total',
    'settlement_refunds_total',
    'settlement_item_failures_total',
    'admin_settlement_retries_total',
    'reconciliation_failures_total',
  ];

  for (const metric of phase9Metrics) {
    const exists = text.includes(metric);
    check(`Metric exists: ${metric}`, exists);
  }

  console.log('\n--- Phase 11 Hardening Metrics ---');

  const phase11Metrics = [
    'settlement_pos_timeouts_total',
    'settlement_pos_circuit_trips_total',
    'settlement_pos_circuit_state',
    'settlement_lock_failures_total',
    'settlement_backlog_gauge',
    'settlement_worker_duration_ms',
  ];

  for (const metric of phase11Metrics) {
    const exists = text.includes(metric);
    check(`Metric exists: ${metric}`, exists);
  }

  // ── Histogram buckets ─────────────────────────────────────
  console.log('\n--- Histogram Validation ---');

  const hasBuckets = text.includes('settlement_worker_duration_ms_bucket');
  check('Worker duration histogram has buckets', hasBuckets);

  const hasSum = text.includes('settlement_worker_duration_ms_sum');
  check('Worker duration histogram has sum', hasSum);

  const hasCount = text.includes('settlement_worker_duration_ms_count');
  check('Worker duration histogram has count', hasCount);

  // ── Metric values ─────────────────────────────────────────
  console.log('\n--- Current Values ---');

  const metricsToPrint = [
    'settlement_pos_circuit_state',
    'settlement_backlog_gauge',
    'settlement_pos_timeouts_total',
    'settlement_pos_circuit_trips_total',
    'settlement_lock_failures_total',
    'settlement_worker_duration_ms_count',
  ];

  for (const metric of metricsToPrint) {
    const match = text.match(new RegExp(`^${metric}(?:\\{[^}]*\\})?\\s+([\\d.e+-]+)`, 'm'));
    if (match) {
      info(metric, match[1]);
    } else {
      info(metric, 'not yet emitted');
    }
  }

  // ── Infrastructure metrics ────────────────────────────────
  console.log('\n--- Infrastructure Metrics ---');

  const infraMetrics = [
    'ws_connections_total',
    'ws_active_connections',
    'redis_health_status',
    'auction_state_transitions_total',
  ];

  for (const metric of infraMetrics) {
    const exists = text.includes(metric);
    check(`Metric exists: ${metric}`, exists);
  }

  // ── Summary ───────────────────────────────────────────────
  console.log('\n============================================');
  console.log(`  RESULT: ${passedChecks}/${totalChecks} checks passed`);
  console.log(passedChecks === totalChecks ? '  ALL CHECKS PASSED' : '  SOME CHECKS FAILED');
  console.log('============================================\n');

  process.exit(passedChecks === totalChecks ? 0 : 1);
}

main().catch((err) => {
  console.error('Metrics validation failed:', err);
  process.exit(1);
});
