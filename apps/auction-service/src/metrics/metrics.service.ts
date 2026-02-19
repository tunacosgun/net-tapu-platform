import { Injectable } from '@nestjs/common';
import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry: Registry;

  readonly wsConnectionsTotal: Counter;
  readonly wsActiveConnections: Gauge;
  readonly wsBidsTotal: Counter;
  readonly wsBidRejectionsTotal: Counter;
  readonly redisHealthStatus: Gauge;
  readonly auctionRateLimitHitsTotal: Counter;
  readonly userRateLimitHitsTotal: Counter;
  readonly auctionExtensionsTotal: Counter;
  readonly auctionEndingsTotal: Counter;
  readonly auctionStateTransitionsTotal: Counter;
  readonly settlementInitiatedTotal: Counter;
  readonly settlementCompletedTotal: Counter;
  readonly settlementFailedTotal: Counter;
  readonly settlementExpiredTotal: Counter;
  readonly settlementCapturesTotal: Counter;
  readonly settlementRefundsTotal: Counter;
  readonly settlementItemFailuresTotal: Counter;
  readonly adminSettlementRetriesTotal: Counter;
  readonly reconciliationFailuresTotal: Counter;

  // Phase 11: Production Hardening metrics
  readonly settlementPosTimeoutsTotal: Counter;
  readonly settlementPosCircuitTripsTotal: Counter;
  readonly settlementPosCircuitState: Gauge;
  readonly settlementLockFailuresTotal: Counter;
  readonly settlementBacklogGauge: Gauge;
  readonly settlementWorkerDurationMs: Histogram;

  constructor() {
    this.registry = new Registry();
    this.registry.setDefaultLabels({ app: 'auction-service' });
    collectDefaultMetrics({ register: this.registry });

    this.wsConnectionsTotal = new Counter({
      name: 'ws_connections_total',
      help: 'Total WebSocket connections by status',
      labelNames: ['status'] as const,
      registers: [this.registry],
    });

    this.wsActiveConnections = new Gauge({
      name: 'ws_active_connections',
      help: 'Current active WebSocket connections',
      registers: [this.registry],
    });

    this.wsBidsTotal = new Counter({
      name: 'ws_bids_total',
      help: 'Total bids received via WebSocket',
      registers: [this.registry],
    });

    this.wsBidRejectionsTotal = new Counter({
      name: 'ws_bid_rejections_total',
      help: 'Total bid rejections by reason code',
      labelNames: ['reason_code'] as const,
      registers: [this.registry],
    });

    this.redisHealthStatus = new Gauge({
      name: 'redis_health_status',
      help: 'Redis health status (1=healthy, 0=unhealthy)',
      registers: [this.registry],
    });

    this.auctionRateLimitHitsTotal = new Counter({
      name: 'auction_rate_limit_hits_total',
      help: 'Total auction-level rate limit hits',
      registers: [this.registry],
    });

    this.userRateLimitHitsTotal = new Counter({
      name: 'user_rate_limit_hits_total',
      help: 'Total user-level rate limit hits',
      registers: [this.registry],
    });

    this.auctionExtensionsTotal = new Counter({
      name: 'auction_extensions_total',
      help: 'Total sniper protection extensions',
      registers: [this.registry],
    });

    this.auctionEndingsTotal = new Counter({
      name: 'auction_endings_total',
      help: 'Total auction endings (ENDING -> ENDED transitions)',
      registers: [this.registry],
    });

    this.auctionStateTransitionsTotal = new Counter({
      name: 'auction_state_transitions_total',
      help: 'Total auction state transitions by from/to status',
      labelNames: ['from', 'to'] as const,
      registers: [this.registry],
    });

    this.settlementInitiatedTotal = new Counter({
      name: 'settlement_initiated_total',
      help: 'Total ENDED → SETTLING transitions',
      registers: [this.registry],
    });

    this.settlementCompletedTotal = new Counter({
      name: 'settlement_completed_total',
      help: 'Total SETTLING → SETTLED transitions',
      registers: [this.registry],
    });

    this.settlementFailedTotal = new Counter({
      name: 'settlement_failed_total',
      help: 'Total SETTLING → SETTLEMENT_FAILED transitions',
      registers: [this.registry],
    });

    this.settlementExpiredTotal = new Counter({
      name: 'settlement_expired_total',
      help: 'Total settlement manifest 48h expiries',
      registers: [this.registry],
    });

    this.settlementCapturesTotal = new Counter({
      name: 'settlement_captures_total',
      help: 'Total successful deposit captures',
      registers: [this.registry],
    });

    this.settlementRefundsTotal = new Counter({
      name: 'settlement_refunds_total',
      help: 'Total successful deposit refunds',
      registers: [this.registry],
    });

    this.settlementItemFailuresTotal = new Counter({
      name: 'settlement_item_failures_total',
      help: 'Total per-item POS failures by action',
      labelNames: ['action'] as const,
      registers: [this.registry],
    });

    this.adminSettlementRetriesTotal = new Counter({
      name: 'admin_settlement_retries_total',
      help: 'Total admin-initiated settlement retries',
      registers: [this.registry],
    });

    this.reconciliationFailuresTotal = new Counter({
      name: 'reconciliation_failures_total',
      help: 'Total reconciliation check failures',
      registers: [this.registry],
    });

    // Phase 11: Production Hardening metrics

    this.settlementPosTimeoutsTotal = new Counter({
      name: 'settlement_pos_timeouts_total',
      help: 'Total POS call timeouts (5s threshold)',
      registers: [this.registry],
    });

    this.settlementPosCircuitTripsTotal = new Counter({
      name: 'settlement_pos_circuit_trips_total',
      help: 'Total POS circuit breaker trips (CLOSED/HALF_OPEN → OPEN)',
      registers: [this.registry],
    });

    this.settlementPosCircuitState = new Gauge({
      name: 'settlement_pos_circuit_state',
      help: 'POS circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
      registers: [this.registry],
    });

    this.settlementLockFailuresTotal = new Counter({
      name: 'settlement_lock_failures_total',
      help: 'Total Redis lock acquisition failures in settlement worker',
      registers: [this.registry],
    });

    this.settlementBacklogGauge = new Gauge({
      name: 'settlement_backlog_gauge',
      help: 'Number of active manifests waiting to be processed',
      registers: [this.registry],
    });

    this.settlementWorkerDurationMs = new Histogram({
      name: 'settlement_worker_duration_ms',
      help: 'Settlement worker tick duration in milliseconds',
      buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
      registers: [this.registry],
    });
  }
}
