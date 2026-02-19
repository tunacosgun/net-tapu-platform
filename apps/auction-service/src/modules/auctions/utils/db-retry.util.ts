import { Logger } from '@nestjs/common';

const logger = new Logger('DbRetry');

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * PostgreSQL error codes that are safe to retry:
 * - 40P01: deadlock_detected
 * - 40001: serialization_failure
 * - 08006: connection_failure
 * - 08001: sqlclient_unable_to_establish_sqlconnection
 * - 08004: sqlserver_rejected_establishment_of_sqlconnection
 * - 57P01: admin_shutdown (server restart)
 */
const RETRYABLE_PG_CODES = new Set([
  '40P01', // deadlock_detected
  '40001', // serialization_failure
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '57P01', // admin_shutdown
]);

/**
 * Error message fragments indicating transient connection issues.
 * Used as fallback when PG error code is not available.
 */
const RETRYABLE_MESSAGES = [
  'connection reset',
  'connection terminated',
  'ECONNRESET',
  'ECONNREFUSED',
  'Connection terminated unexpectedly',
];

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // Check PostgreSQL error code
  const pgCode = (err as Error & { code?: string }).code;
  if (pgCode && RETRYABLE_PG_CODES.has(pgCode)) return true;

  // Fallback: check error message for transient connection issues
  const message = err.message;
  return RETRYABLE_MESSAGES.some((fragment) => message.includes(fragment));
}

/**
 * Execute an async function with retries for transient DB failures.
 *
 * Only retries on:
 *   - deadlock_detected (40P01)
 *   - serialization_failure (40001)
 *   - connection failures (08xxx, 57P01)
 *   - connection reset errors
 *
 * Does NOT retry business validation errors, constraint violations, etc.
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    baseDelayMs?: number;
    context?: string;
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const context = options?.context ?? 'db_operation';

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;

      if (attempt >= maxRetries || !isRetryableError(err)) {
        throw err;
      }

      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);

      logger.warn(
        JSON.stringify({
          event: 'db_retry',
          context,
          attempt: attempt + 1,
          max_retries: maxRetries,
          delay_ms: Math.round(delay),
          error_code: (err as Error & { code?: string }).code ?? null,
          error_message: (err as Error).message,
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}
