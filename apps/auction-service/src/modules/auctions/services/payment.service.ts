import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { MetricsService } from '../../../metrics/metrics.service';

// ── Request / Response interfaces ─────────────────────────────

export interface CaptureRequest {
  depositId: string;
  posTransactionId: string | null;
  posProvider: string | null;
  amount: string;
  currency: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface CaptureResponse {
  success: boolean;
  posReference: string | null;
  message: string;
}

export interface RefundRequest {
  depositId: string;
  posTransactionId: string | null;
  posProvider: string | null;
  amount: string;
  currency: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface RefundResponse {
  success: boolean;
  posRefundId: string | null;
  message: string;
}

// ── Interface ─────────────────────────────────────────────────

export interface IPaymentService {
  captureDeposit(req: CaptureRequest): Promise<CaptureResponse>;
  refundDeposit(req: RefundRequest): Promise<RefundResponse>;
}

// ── DI Token ──────────────────────────────────────────────────

export const PAYMENT_SERVICE = Symbol('PAYMENT_SERVICE');

// ── Circuit Breaker ──────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_RECOVERY_MS = 60_000; // 60 seconds

export class CircuitOpenError extends Error {
  constructor() {
    super('POS circuit breaker is OPEN — calls blocked');
    this.name = 'CircuitOpenError';
  }
}

export class PosTimeoutError extends Error {
  constructor(operationMs: number) {
    super(`POS call timed out after ${operationMs}ms`);
    this.name = 'PosTimeoutError';
  }
}

const POS_TIMEOUT_MS = 5_000;

const CIRCUIT_STATE_VALUES: Record<CircuitState, number> = {
  CLOSED: 0,
  HALF_OPEN: 1,
  OPEN: 2,
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;

  private readonly logger = new Logger(CircuitBreaker.name);
  private readonly onStateChange?: (state: CircuitState) => void;
  private readonly onTrip?: () => void;

  constructor(callbacks?: {
    onStateChange?: (state: CircuitState) => void;
    onTrip?: () => void;
  }) {
    this.onStateChange = callbacks?.onStateChange;
    this.onTrip = callbacks?.onTrip;
  }

  getState(): CircuitState {
    this.evaluateState();
    return this.state;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitOpenError if circuit is OPEN and recovery time hasn't elapsed.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.evaluateState();

    if (this.state === 'OPEN') {
      throw new CircuitOpenError();
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private evaluateState(): void {
    if (this.state !== 'OPEN') return;

    const elapsed = Date.now() - this.lastFailureTime;
    if (elapsed >= CIRCUIT_RECOVERY_MS) {
      this.transitionTo('HALF_OPEN');
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      // One success in HALF_OPEN → CLOSED
      this.failureCount = 0;
      this.transitionTo('CLOSED');
    }
    this.successCount++;
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // One failure in HALF_OPEN → OPEN again
      this.transitionTo('OPEN');
      return;
    }

    if (this.failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(newState: CircuitState): void {
    const prev = this.state;
    this.state = newState;

    if (prev !== newState) {
      this.logger.warn(
        JSON.stringify({
          event: 'pos_circuit_state_change',
          from: prev,
          to: newState,
          failure_count: this.failureCount,
          success_count: this.successCount,
        }),
      );
      this.onStateChange?.(newState);

      if (newState === 'OPEN') {
        this.onTrip?.();
      }
    }
  }
}

// ── POS Timeout Wrapper ─────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PosTimeoutError(ms)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ── Chaos Mode Constants ─────────────────────────────────────

const CHAOS_FAIL_RATE = 0.5;       // 50% failure rate in chaos mode
const CHAOS_TIMEOUT_RATE = 0.1;    // 10% simulated timeout in chaos mode
const CHAOS_TIMEOUT_MS = 6_000;    // Exceeds POS_TIMEOUT_MS to trigger timeout

// ── Mock Implementation ───────────────────────────────────────

@Injectable()
export class MockPaymentService implements IPaymentService {
  private readonly logger = new Logger(MockPaymentService.name);
  private readonly circuitBreaker: CircuitBreaker;
  private readonly chaosEnabled: boolean;
  private callCount = 0;

  constructor(
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService,
  ) {
    this.chaosEnabled = process.env.POS_FAIL_MODE === 'true';

    this.circuitBreaker = new CircuitBreaker({
      onStateChange: (state) => {
        this.metrics?.settlementPosCircuitState.set(CIRCUIT_STATE_VALUES[state]);
      },
      onTrip: () => {
        this.metrics?.settlementPosCircuitTripsTotal.inc();
      },
    });

    if (this.chaosEnabled) {
      this.logger.warn(
        JSON.stringify({
          event: 'pos_chaos_mode_enabled',
          fail_rate: CHAOS_FAIL_RATE,
          timeout_rate: CHAOS_TIMEOUT_RATE,
        }),
      );
    }
  }

  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  async captureDeposit(req: CaptureRequest): Promise<CaptureResponse> {
    return this.circuitBreaker.execute(async () => {
      try {
        return await withTimeout(this.doCapture(req), POS_TIMEOUT_MS);
      } catch (err) {
        if (err instanceof PosTimeoutError) {
          this.metrics?.settlementPosTimeoutsTotal.inc();
          this.logger.warn(
            JSON.stringify({
              event: 'pos_timeout',
              operation: 'capture',
              deposit_id: req.depositId,
              timeout_ms: POS_TIMEOUT_MS,
            }),
          );
        }
        throw err;
      }
    });
  }

  async refundDeposit(req: RefundRequest): Promise<RefundResponse> {
    return this.circuitBreaker.execute(async () => {
      try {
        return await withTimeout(this.doRefund(req), POS_TIMEOUT_MS);
      } catch (err) {
        if (err instanceof PosTimeoutError) {
          this.metrics?.settlementPosTimeoutsTotal.inc();
          this.logger.warn(
            JSON.stringify({
              event: 'pos_timeout',
              operation: 'refund',
              deposit_id: req.depositId,
              timeout_ms: POS_TIMEOUT_MS,
            }),
          );
        }
        throw err;
      }
    });
  }

  private async doCapture(req: CaptureRequest): Promise<CaptureResponse> {
    this.logger.debug(
      JSON.stringify({
        event: 'pos_capture_request',
        deposit_id: req.depositId,
        amount: req.amount,
        currency: req.currency,
        idempotency_key: req.idempotencyKey,
      }),
    );

    await this.simulateLatencyWithChaos();

    if (this.chaosEnabled && this.shouldFail()) {
      return {
        success: false,
        posReference: null,
        message: 'Mock POS chaos: capture rejected',
      };
    }

    return {
      success: true,
      posReference: `mock_capture_${req.depositId}_${Date.now()}`,
      message: 'Mock capture successful',
    };
  }

  private async doRefund(req: RefundRequest): Promise<RefundResponse> {
    this.logger.debug(
      JSON.stringify({
        event: 'pos_refund_request',
        deposit_id: req.depositId,
        amount: req.amount,
        currency: req.currency,
        idempotency_key: req.idempotencyKey,
      }),
    );

    await this.simulateLatencyWithChaos();

    if (this.chaosEnabled && this.shouldFail()) {
      return {
        success: false,
        posRefundId: null,
        message: 'Mock POS chaos: refund rejected',
      };
    }

    return {
      success: true,
      posRefundId: `mock_refund_${req.depositId}_${Date.now()}`,
      message: 'Mock refund successful',
    };
  }

  private shouldFail(): boolean {
    return Math.random() < CHAOS_FAIL_RATE;
  }

  private async simulateLatencyWithChaos(): Promise<void> {
    this.callCount++;

    if (this.chaosEnabled && Math.random() < CHAOS_TIMEOUT_RATE) {
      // Simulate a slow POS response that exceeds the timeout
      await new Promise((resolve) => setTimeout(resolve, CHAOS_TIMEOUT_MS));
      return;
    }

    // Normal latency: 50-200ms
    const ms = 50 + Math.random() * 150;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
