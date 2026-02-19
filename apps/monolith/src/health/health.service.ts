import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private redis: Redis;
  private redisFailedSince: Date | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    this.redis = new Redis(this.config.get<string>('REDIS_URL')!, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
  }

  async check() {
    const results: Record<string, unknown> = { status: 'ok' };

    try {
      await this.dataSource.query('SELECT 1');
      results.database = 'ok';
    } catch (e) {
      this.logger.error('DB health check failed', (e as Error).message);
      results.status = 'critical';
      results.database = 'error';
    }

    try {
      await this.redis.ping();
      results.redis = 'ok';
      this.redisFailedSince = null;
    } catch (e) {
      this.logger.error('Redis health check failed', (e as Error).message);
      this.redisFailedSince ??= new Date();
      const downtime = Date.now() - this.redisFailedSince.getTime();
      results.redis = 'error';
      results.redisDowntime = downtime;

      if (downtime > 30_000) {
        results.status = 'critical';
      } else if (results.status !== 'critical') {
        results.status = 'degraded';
      }
    }

    return results;
  }
}
