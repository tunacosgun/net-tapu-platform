import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import { JsonLoggerService } from '@nettapu/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const jsonLogger = new JsonLoggerService('monolith');
  const logger = new Logger('Bootstrap');

  // ── Startup sanity checks ────────────────────────────────────
  const nodeEnv = process.env.NODE_ENV;
  const jwtSecret = process.env.JWT_SECRET;
  const corsOrigin = process.env.CORS_ORIGIN;

  if (
    nodeEnv === 'production' &&
    jwtSecret === 'change_me_in_production_min_32_chars!!'
  ) {
    jsonLogger.fatal(
      'FATAL: JWT_SECRET is set to the default value in production. Refusing to start.',
      'Bootstrap',
    );
    process.exit(1);
  }

  if (
    nodeEnv === 'production' &&
    (!corsOrigin || corsOrigin === '*')
  ) {
    jsonLogger.fatal(
      'FATAL: CORS_ORIGIN must be set to a specific origin in production (not wildcard). Refusing to start.',
      'Bootstrap',
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { logger: jsonLogger });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true },
    }),
  );

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: corsOrigin || '*' });
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Monolith running on port ${port}`);
}

bootstrap();
