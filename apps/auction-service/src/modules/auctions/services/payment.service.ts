import { Injectable, Logger } from '@nestjs/common';

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

// ── Mock Implementation ───────────────────────────────────────

@Injectable()
export class MockPaymentService implements IPaymentService {
  private readonly logger = new Logger(MockPaymentService.name);

  async captureDeposit(req: CaptureRequest): Promise<CaptureResponse> {
    this.logger.log(
      `[MOCK] Capturing deposit ${req.depositId}: ${req.amount} ${req.currency} (idempotency=${req.idempotencyKey})`,
    );

    // Simulate POS latency (50-200ms)
    await this.simulateLatency();

    return {
      success: true,
      posReference: `mock_capture_${req.depositId}_${Date.now()}`,
      message: 'Mock capture successful',
    };
  }

  async refundDeposit(req: RefundRequest): Promise<RefundResponse> {
    this.logger.log(
      `[MOCK] Refunding deposit ${req.depositId}: ${req.amount} ${req.currency} (idempotency=${req.idempotencyKey})`,
    );

    // Simulate POS latency (50-200ms)
    await this.simulateLatency();

    return {
      success: true,
      posRefundId: `mock_refund_${req.depositId}_${Date.now()}`,
      message: 'Mock refund successful',
    };
  }

  private simulateLatency(): Promise<void> {
    const ms = 50 + Math.random() * 150;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
