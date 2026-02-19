import { Injectable } from '@nestjs/common';
import {
  Registry,
  Counter,
  Gauge,
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
  }
}
