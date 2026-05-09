import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IPosGateway,
  ProvisionRequest,
  ProvisionResponse,
  ProvisionInitiationResponse,
  CompleteProvisionRequest,
  TransactionStatusResponse,
  CaptureProvisionRequest,
  CaptureProvisionResponse,
  CancelProvisionRequest,
  CancelProvisionResponse,
  PosRefundRequest,
  PosRefundResponse,
  PaytrGateway,
  PaytrConfig,
  IyzicoGateway,
  IyzicoConfig,
  MokaGateway,
  MokaConfig,
} from '@nettapu/shared';
import { MockPosGateway } from './mock-pos-gateway.service';

const logger = new Logger('PosGatewayFactory');

const DEFAULT_POS_TIMEOUT_MS = 7000;

class PosTimeoutError extends Error {
  constructor(method: string, ms: number) {
    super(`POS call "${method}" timed out after ${ms}ms`);
    this.name = 'PosTimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, method: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new PosTimeoutError(method, ms)),
      ms,
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Wraps any IPosGateway with a per-call timeout.
 * Rejects with PosTimeoutError if the underlying call exceeds the limit.
 * Does not modify the gateway instance — pure decorator.
 */
class TimeoutPosGateway implements IPosGateway {
  constructor(
    private readonly inner: IPosGateway,
    private readonly timeoutMs: number,
  ) {}

  initiateProvision(req: ProvisionRequest): Promise<ProvisionInitiationResponse> {
    return withTimeout(this.inner.initiateProvision(req), this.timeoutMs, 'initiateProvision');
  }

  completeProvision(req: CompleteProvisionRequest): Promise<ProvisionResponse> {
    return withTimeout(this.inner.completeProvision(req), this.timeoutMs, 'completeProvision');
  }

  verifyCallback(headers: Record<string, string>, body: Record<string, unknown>): boolean {
    return this.inner.verifyCallback(headers, body);
  }

  capture(req: CaptureProvisionRequest): Promise<CaptureProvisionResponse> {
    return withTimeout(this.inner.capture(req), this.timeoutMs, 'capture');
  }

  cancelProvision(req: CancelProvisionRequest): Promise<CancelProvisionResponse> {
    return withTimeout(this.inner.cancelProvision(req), this.timeoutMs, 'cancelProvision');
  }

  refund(req: PosRefundRequest): Promise<PosRefundResponse> {
    return withTimeout(this.inner.refund(req), this.timeoutMs, 'refund');
  }

  provision(req: ProvisionRequest): Promise<ProvisionResponse> {
    return withTimeout(this.inner.provision(req), this.timeoutMs, 'provision');
  }

  queryTransactionStatus(posReference: string): Promise<TransactionStatusResponse> {
    if (!this.inner.queryTransactionStatus) {
      throw new Error('queryTransactionStatus not supported by this provider');
    }
    return withTimeout(this.inner.queryTransactionStatus(posReference), this.timeoutMs, 'queryTransactionStatus');
  }
}

/**
 * Factory function for POS_GATEWAY DI token.
 * Reads POS_PROVIDER env var and returns the matching gateway instance
 * wrapped with a timeout decorator.
 *
 * Production: POS_PROVIDER must be explicitly set (validated in ConfigModule).
 * Development: defaults to 'mock' if unset.
 *
 * To add a new provider:
 *   1. Create a class implementing IPosGateway
 *   2. Add a case to the switch below
 *   3. Inject any config the provider needs from ConfigService
 */
export function posGatewayFactory(config: ConfigService): IPosGateway {
  const provider = config.get<string>('POS_PROVIDER', 'mock');
  const timeoutMs = config.get<number>('POS_TIMEOUT_MS', DEFAULT_POS_TIMEOUT_MS);

  let gateway: IPosGateway;

  switch (provider) {
    case 'mock':
      logger.log('POS provider initialized: mock');
      gateway = new MockPosGateway();
      break;

    case 'paytr': {
      const paytrConfig: PaytrConfig = {
        merchantId: config.getOrThrow<string>('PAYTR_MERCHANT_ID'),
        merchantKey: config.getOrThrow<string>('PAYTR_MERCHANT_KEY'),
        merchantSalt: config.getOrThrow<string>('PAYTR_MERCHANT_SALT'),
        callbackUrl: config.getOrThrow<string>('PAYTR_CALLBACK_URL'),
        okUrl: config.getOrThrow<string>('PAYTR_OK_URL'),
        failUrl: config.getOrThrow<string>('PAYTR_FAIL_URL'),
        testMode: config.get<string>('PAYTR_TEST_MODE', '1') === '1',
      };
      const httpPost = async (url: string, data: URLSearchParams) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: data.toString(),
            signal: controller.signal,
          });
          return { data: await res.json() };
        } finally {
          clearTimeout(timer);
        }
      };
      gateway = new PaytrGateway(paytrConfig, httpPost, logger);
      logger.log('POS provider initialized: paytr');
      break;
    }

    case 'iyzico': {
      const iyzicoConfig: IyzicoConfig = {
        apiKey: config.getOrThrow<string>('IYZICO_API_KEY'),
        secretKey: config.getOrThrow<string>('IYZICO_SECRET_KEY'),
        baseUrl: config.get<string>('IYZICO_BASE_URL', 'https://sandbox-api.iyzipay.com'),
        callbackUrl: config.getOrThrow<string>('IYZICO_CALLBACK_URL'),
      };
      const httpPostJson = async (url: string, body: unknown, headers: Record<string, string>) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          return { data: await res.json() };
        } finally {
          clearTimeout(timer);
        }
      };
      gateway = new IyzicoGateway(iyzicoConfig, httpPostJson, logger);
      logger.log('POS provider initialized: iyzico');
      break;
    }

    case 'moka': {
      const mokaConfig: MokaConfig = {
        dealerCode: config.getOrThrow<string>('MOKA_DEALER_CODE'),
        username: config.getOrThrow<string>('MOKA_USERNAME'),
        password: config.getOrThrow<string>('MOKA_PASSWORD'),
        shaIndex: config.getOrThrow<string>('MOKA_SHA_INDEX'),
        baseUrl: config.get<string>('MOKA_BASE_URL', 'https://service.testmoka.com'),
        callbackUrl: config.getOrThrow<string>('MOKA_CALLBACK_URL'),
        testMode: config.get<string>('MOKA_TEST_MODE', '1') === '1',
      };
      const httpPostJson = async (url: string, body: unknown, headers: Record<string, string>) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          return { data: await res.json() };
        } finally {
          clearTimeout(timer);
        }
      };
      gateway = new MokaGateway(mokaConfig, httpPostJson, logger);
      logger.log('POS provider initialized: moka');
      break;
    }

    default:
      throw new Error(
        `Unknown POS_PROVIDER: "${provider}". Supported: mock, paytr, iyzico, moka`,
      );
  }

  logger.log(`POS timeout: ${timeoutMs}ms`);
  return new TimeoutPosGateway(gateway, timeoutMs);
}
