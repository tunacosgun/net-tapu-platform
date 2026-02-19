import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { MetricsService } from '../../../metrics/metrics.service';

@Injectable()
export class RedisLockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisLockService.name);
  private redis!: Redis;
  private redisHealthy = false;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.redis = new Redis(this.config.get<string>('REDIS_URL')!, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 2000,
      lazyConnect: false,
      enableOfflineQueue: false,
    });

    this.redis.on('ready', () => {
      this.redisHealthy = true;
      this.metrics?.redisHealthStatus.set(1);
      this.logger.log('Redis lock client connected');
    });

    this.redis.on('error', (err) => {
      this.redisHealthy = false;
      this.metrics?.redisHealthStatus.set(0);
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    this.redis.on('close', () => {
      this.redisHealthy = false;
      this.metrics?.redisHealthStatus.set(0);
      this.logger.warn('Redis connection closed');
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  isHealthy(): boolean {
    return this.redisHealthy;
  }

  /**
   * Acquire a distributed lock using SET NX PX.
   * Returns the lock value (for safe release) or null if not acquired.
   */
  async acquire(key: string, ttlMs: number): Promise<string | null> {
    const lockValue = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const result = await this.redis.set(key, lockValue, 'PX', ttlMs, 'NX');
    if (result === 'OK') {
      return lockValue;
    }
    return null;
  }

  /**
   * Release a lock only if we still own it.
   * Uses Lua script for atomic compare-and-delete to prevent
   * releasing a lock that expired and was acquired by another process.
   */
  async release(key: string, lockValue: string): Promise<boolean> {
    const lua = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.redis.eval(lua, 1, key, lockValue);
    return result === 1;
  }

  /**
   * Generic distributed rate limiter using atomic INCR + EXPIRE.
   * Works for any key prefix (user-level, auction-level, etc.).
   */
  async checkRateLimit(
    key: string,
    maxCount: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const lua = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `;
    const count = (await this.redis.eval(
      lua,
      1,
      key,
      windowSeconds,
    )) as number;
    return { allowed: count <= maxCount, current: count };
  }

  /**
   * Per-user bid rate limiter.
   */
  async checkBidRateLimit(
    userId: string,
    maxBids: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; current: number }> {
    return this.checkRateLimit(`ws:bid:rate:user:${userId}`, maxBids, windowSeconds);
  }

  /**
   * Per-auction bid rate limiter.
   */
  async checkAuctionRateLimit(
    auctionId: string,
    maxBids: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; current: number }> {
    return this.checkRateLimit(`ws:bid:rate:auction:${auctionId}`, maxBids, windowSeconds);
  }
}
