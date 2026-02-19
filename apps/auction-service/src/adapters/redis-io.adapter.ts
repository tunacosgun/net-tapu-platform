import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions } from 'socket.io';
import { INestApplication, Logger } from '@nestjs/common';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: any;

  constructor(app: INestApplication, private readonly redisUrl: string) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const pubClient = new Redis(this.redisUrl, { lazyConnect: true });
    const subClient = new Redis(this.redisUrl, { lazyConnect: true });

    // Attach error handlers BEFORE connecting to prevent unhandled error crashes
    pubClient.on('error', (err) => {
      this.logger.error(`Redis pub client error: ${err.message}`);
    });
    subClient.on('error', (err) => {
      this.logger.error(`Redis sub client error: ${err.message}`);
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Redis IO adapter connected (pub/sub)');
  }

  createIOServer(port: number, options?: Partial<ServerOptions>) {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
