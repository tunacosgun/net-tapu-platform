import {
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
} from '../../pos-gateway.types';
import { BasePosGateway, PosLogger } from '../base-pos-gateway';
import {
  MokaConfig,
  MokaAuth,
  MokaCallbackBody,
  MokaDirectPayment3dRequest,
  MokaDirectPayment3dResponse,
  MokaVoidRequest,
  MokaVoidResponse,
  MokaCaptureRequest,
  MokaCaptureResponse,
  MokaRefundRequest,
  MokaRefundResponse,
  MokaQueryRequest,
  MokaQueryResponse,
} from './moka-types';
import { generateMokaCheckKey, verifyMokaCallbackHash } from './moka-signature';
import { MokaApiError, mapMokaResultCode } from './moka-errors';

const ENDPOINTS = {
  payment3d: '/PaymentDealer/DoDirectPayment3dRequestHandler',
  void: '/PaymentDealer/DoVoid',
  capture: '/PaymentDealer/DoCapture',
  refund: '/PaymentDealer/DoRefund',
  query: '/PaymentDealer/GetDealerPaymentTransaction',
};

type HttpPostJson = (
  url: string,
  body: unknown,
  headers: Record<string, string>,
) => Promise<{ data: unknown }>;

/**
 * Moka United (refmoka) virtual POS gateway adapter.
 *
 * Flow:
 *   1. initiateProvision() → POST DoDirectPayment3dRequestHandler
 *      → returns hosted 3DS URL (Data.Url) and CodeForHash
 *   2. Client redirects to Url; Moka POSTs hashed callback to RedirectUrl
 *   3. verifyCallback() validates hash → completeProvision() recognises success/fail
 *   4. capture() → DoCapture
 *   5. cancelProvision() → DoVoid (same-day before settlement)
 *   6. refund() → DoRefund (after settlement)
 */
export class MokaGateway extends BasePosGateway {
  protected readonly providerName = 'moka';
  private readonly config: MokaConfig;
  private readonly httpPostJson: HttpPostJson;

  constructor(config: MokaConfig, httpPostJson: HttpPostJson, logger: PosLogger) {
    super(logger);
    this.config = config;
    this.httpPostJson = httpPostJson;
  }

  // ── Public API ────────────────────────────────────────────

  async initiateProvision(req: ProvisionRequest): Promise<ProvisionInitiationResponse> {
    const requestId = this.logRequest('initiateProvision', {
      payment_id: req.paymentId,
      amount: req.amount,
      currency: req.currency,
    });

    if (!req.cardToken) {
      // Moka requires actual card data or a stored token; we don't auto-fabricate.
      this.logResponse('initiateProvision', requestId, false, {
        payment_id: req.paymentId,
        reason: 'card_token_missing',
      });
      return {
        status: 'failed',
        posReference: null,
        message: 'Moka initiateProvision requires a cardToken (tokenized card data)',
      };
    }

    try {
      const card = this.parseCardToken(req.cardToken);
      const buyer = req.buyer;
      const body: MokaDirectPayment3dRequest = {
        PaymentDealerAuthentication: this.buildAuth(),
        PaymentDealerRequest: {
          CardHolderFullName:
            card.holder ||
            (buyer ? `${buyer.firstName} ${buyer.lastName}` : 'Net Tapu'),
          CardNumber: card.number,
          ExpMonth: card.expMonth,
          ExpYear: card.expYear,
          CvcNumber: card.cvc,
          Amount: this.toDecimal(req.amount),
          Currency: this.mapCurrency(req.currency),
          InstallmentNumber: 0,
          ClientIP: buyer?.ip ?? '127.0.0.1',
          OtherTrxCode: req.paymentId,
          Software: 'NetTapu',
          Description: `NetTapu payment ${req.paymentId}`,
          ReturnHash: 1,
          RedirectUrl: this.config.callbackUrl,
          RedirectType: req.isMoto ? 0 : 1,
          IsMailOrderTransaction: req.isMoto ? 1 : 0,
          BuyerInformation: buyer
            ? {
                BuyerFullName: `${buyer.firstName} ${buyer.lastName}`,
                BuyerEmail: buyer.email,
                BuyerGsmNumber: buyer.phone,
                BuyerAddress: buyer.address,
              }
            : undefined,
        },
      };

      const response = await this.httpPostJson(
        this.url(ENDPOINTS.payment3d),
        body,
        this.jsonHeaders(),
      );
      const data = response.data as MokaDirectPayment3dResponse;

      if (data.IsSuccessful) {
        // MOTO transactions complete immediately — no 3DS redirect
        if (req.isMoto) {
          this.logResponse('initiateProvision', requestId, true, {
            payment_id: req.paymentId,
            channel: 'MOTO',
          });
          return {
            status: 'completed',
            posReference: req.paymentId,
            message: 'Moka MOTO transaction completed',
            posTransactionToken: data.Data?.CodeForHash || req.paymentId,
          };
        }
        if (data.Data?.Url) {
          this.logResponse('initiateProvision', requestId, true, {
            payment_id: req.paymentId,
            has_url: true,
          });
          return {
            status: 'requires_3ds',
            posReference: null,
            message: 'Moka 3DS URL ready — redirect user',
            threeDsRedirectUrl: data.Data.Url,
            posTransactionToken: data.Data.CodeForHash || req.paymentId,
          };
        }
      }

      const failMsg = mapMokaResultCode(data.ResultCode, data.ResultMessage);
      this.logResponse('initiateProvision', requestId, false, {
        payment_id: req.paymentId,
        result_code: data.ResultCode,
        message: failMsg,
      });
      return {
        status: 'failed',
        posReference: null,
        message: failMsg,
      };
    } catch (error) {
      this.logError('initiateProvision', requestId, error);
      return {
        status: 'failed',
        posReference: null,
        message: this.normalizeError('initiateProvision', error).message,
      };
    }
  }

  async completeProvision(req: CompleteProvisionRequest): Promise<ProvisionResponse> {
    const requestId = this.logRequest('completeProvision', {
      payment_id: req.paymentId,
      has_callback: true,
    });

    try {
      const cb = req.callbackPayload as MokaCallbackBody;

      if (cb.resultCode === '1' || cb.resultCode === 'Success') {
        this.logResponse('completeProvision', requestId, true, {
          payment_id: req.paymentId,
          trx_code: cb.trxCode,
        });
        return {
          success: true,
          posReference: (cb.trxCode as string) || cb.OtherTrxCode,
          message: 'Moka payment completed successfully',
        };
      }

      const failMsg = cb.resultMessage || mapMokaResultCode(cb.resultCode);
      this.logResponse('completeProvision', requestId, false, {
        payment_id: req.paymentId,
        result_code: cb.resultCode,
        reason: failMsg,
      });
      return {
        success: false,
        posReference: (cb.trxCode as string) || cb.OtherTrxCode || null,
        message: `Moka payment failed: ${failMsg}`,
      };
    } catch (error) {
      this.logError('completeProvision', requestId, error);
      return {
        success: false,
        posReference: null,
        message: this.normalizeError('completeProvision', error).message,
      };
    }
  }

  verifyCallback(_headers: Record<string, string>, body: Record<string, unknown>): boolean {
    const cb = body as MokaCallbackBody;
    if (!cb.OtherTrxCode || !cb.resultCode || !cb.amount || !cb.hashValue) {
      return false;
    }
    return verifyMokaCallbackHash(
      cb.OtherTrxCode,
      this.config.dealerCode,
      cb.amount,
      cb.resultCode,
      this.config.shaIndex,
      cb.hashValue,
    );
  }

  async capture(req: CaptureProvisionRequest): Promise<CaptureProvisionResponse> {
    const requestId = this.logRequest('capture', {
      payment_id: req.paymentId,
      pos_reference: req.posReference,
      amount: req.amount,
    });

    try {
      const body: MokaCaptureRequest = {
        PaymentDealerAuthentication: this.buildAuth(),
        CaptureRequest: {
          OtherTrxCode: req.paymentId,
          VirtualPosOrderId: req.posReference,
          Amount: this.toDecimal(req.amount),
          Currency: this.mapCurrency(req.currency),
        },
      };
      const response = await this.httpPostJson(
        this.url(ENDPOINTS.capture),
        body,
        this.jsonHeaders(),
      );
      const data = response.data as MokaCaptureResponse;

      if (data.IsSuccessful && data.Data?.IsSuccessful !== false) {
        this.logResponse('capture', requestId, true, {
          payment_id: req.paymentId,
          virtual_pos_order_id: data.Data?.VirtualPosOrderId,
        });
        return {
          success: true,
          posReference: data.Data?.VirtualPosOrderId || req.posReference,
          message: 'Moka capture successful',
        };
      }

      const failMsg = mapMokaResultCode(data.ResultCode, data.ResultMessage);
      this.logResponse('capture', requestId, false, {
        payment_id: req.paymentId,
        result_code: data.ResultCode,
      });
      return { success: false, posReference: req.posReference, message: failMsg };
    } catch (error) {
      this.logError('capture', requestId, error);
      return {
        success: false,
        posReference: req.posReference,
        message: this.normalizeError('capture', error).message,
      };
    }
  }

  async cancelProvision(req: CancelProvisionRequest): Promise<CancelProvisionResponse> {
    const requestId = this.logRequest('cancelProvision', {
      payment_id: req.paymentId,
      pos_reference: req.posReference,
    });

    try {
      const body: MokaVoidRequest = {
        PaymentDealerAuthentication: this.buildAuth(),
        VoidRequest: {
          OtherTrxCode: req.paymentId,
          VirtualPosOrderId: req.posReference,
        },
      };
      const response = await this.httpPostJson(
        this.url(ENDPOINTS.void),
        body,
        this.jsonHeaders(),
      );
      const data = response.data as MokaVoidResponse;

      if (data.IsSuccessful) {
        this.logResponse('cancelProvision', requestId, true, {
          payment_id: req.paymentId,
        });
        return { success: true, message: 'Moka void successful' };
      }

      const failMsg = mapMokaResultCode(data.ResultCode, data.ResultMessage);
      this.logResponse('cancelProvision', requestId, false, {
        payment_id: req.paymentId,
        result_code: data.ResultCode,
      });
      return { success: false, message: failMsg };
    } catch (error) {
      this.logError('cancelProvision', requestId, error);
      return this.normalizeError('cancelProvision', error);
    }
  }

  async refund(req: PosRefundRequest): Promise<PosRefundResponse> {
    const requestId = this.logRequest('refund', {
      payment_id: req.paymentId,
      pos_reference: req.posReference,
      amount: req.amount,
    });

    try {
      const body: MokaRefundRequest = {
        PaymentDealerAuthentication: this.buildAuth(),
        RefundRequest: {
          OtherTrxCode: req.paymentId,
          VirtualPosOrderId: req.posReference,
          Amount: this.toDecimal(req.amount),
          Currency: this.mapCurrency(req.currency),
        },
      };
      const response = await this.httpPostJson(
        this.url(ENDPOINTS.refund),
        body,
        this.jsonHeaders(),
      );
      const data = response.data as MokaRefundResponse;

      if (data.IsSuccessful) {
        this.logResponse('refund', requestId, true, {
          payment_id: req.paymentId,
          refund_code: data.Data?.RefundCode,
        });
        return {
          success: true,
          posRefundReference: data.Data?.RefundCode || null,
          message: 'Moka refund successful',
        };
      }

      const failMsg = mapMokaResultCode(data.ResultCode, data.ResultMessage);
      this.logResponse('refund', requestId, false, {
        payment_id: req.paymentId,
        result_code: data.ResultCode,
      });
      throw new MokaApiError(
        failMsg,
        data.ResultCode,
        data as unknown as Record<string, unknown>,
      );
    } catch (error) {
      if (error instanceof MokaApiError) {
        this.logError('refund', requestId, error);
        return { success: false, posRefundReference: null, message: error.message };
      }
      this.logError('refund', requestId, error);
      return {
        success: false,
        posRefundReference: null,
        message: this.normalizeError('refund', error).message,
      };
    }
  }

  async queryTransactionStatus(posReference: string): Promise<TransactionStatusResponse> {
    const requestId = this.logRequest('queryTransactionStatus', { pos_reference: posReference });

    try {
      const body: MokaQueryRequest = {
        PaymentDealerAuthentication: this.buildAuth(),
        PaymentDealerRequest: { VirtualPosOrderId: posReference },
      };
      const response = await this.httpPostJson(
        this.url(ENDPOINTS.query),
        body,
        this.jsonHeaders(),
      );
      const data = response.data as MokaQueryResponse;

      if (data.IsSuccessful && data.Data) {
        this.logResponse('queryTransactionStatus', requestId, true, { pos_reference: posReference });
        return {
          found: true,
          status: this.mapTrxStatus(data.Data.TrxStatus),
          amount: data.Data.Amount?.toString(),
          currency: data.Data.Currency,
          posReference: data.Data.VirtualPosOrderId,
          rawResponse: data as unknown as Record<string, unknown>,
        };
      }

      this.logResponse('queryTransactionStatus', requestId, false, { pos_reference: posReference });
      return { found: false, status: 'not_found' };
    } catch (error) {
      this.logError('queryTransactionStatus', requestId, error);
      return { found: false, status: 'error' };
    }
  }

  /** @deprecated Use initiateProvision() + completeProvision() */
  async provision(req: ProvisionRequest): Promise<ProvisionResponse> {
    const result = await this.initiateProvision(req);
    if (result.status === 'completed') {
      return { success: true, posReference: result.posReference, message: result.message };
    }
    return {
      success: false,
      posReference: null,
      message:
        result.status === 'requires_3ds'
          ? '3DS required — use initiateProvision() + completeProvision()'
          : result.message,
    };
  }

  // ── Helpers ───────────────────────────────────────────────

  private buildAuth(): MokaAuth {
    return {
      DealerCode: this.config.dealerCode,
      Username: this.config.username,
      Password: this.config.password,
      CheckKey: generateMokaCheckKey(
        this.config.dealerCode,
        this.config.username,
        this.config.password,
        this.config.shaIndex,
      ),
    };
  }

  private url(path: string): string {
    const base = this.config.baseUrl.replace(/\/+$/, '');
    return base + path;
  }

  private jsonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', Accept: 'application/json' };
  }

  /** Convert decimal string TRY amount to Moka decimal number */
  private toDecimal(amount: string): number {
    const n = parseFloat(amount);
    return Math.round(n * 100) / 100;
  }

  private mapCurrency(currency: string): 'TL' | 'EUR' | 'USD' | 'GBP' {
    const map: Record<string, 'TL' | 'EUR' | 'USD' | 'GBP'> = {
      TRY: 'TL',
      EUR: 'EUR',
      USD: 'USD',
      GBP: 'GBP',
    };
    return map[currency] || 'TL';
  }

  /** Map Moka TrxStatus enum to our generic status string */
  private mapTrxStatus(s: number | undefined): string {
    switch (s) {
      case 1:
        return 'completed';
      case 2:
        return 'voided';
      case 3:
        return 'refunded';
      case 4:
        return 'failed';
      default:
        return 'unknown';
    }
  }

  /**
   * Parse an opaque cardToken into card components.
   * NetTapu encodes card data as JSON {n,m,y,c,h} client-side and
   * encrypts it before sending. Adapter receives a base64 JSON blob.
   * In real Moka tokenized flow this would be the persistent token.
   */
  private parseCardToken(token: string): {
    number: string;
    expMonth: string;
    expYear: string;
    cvc: string;
    holder?: string;
  } {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded) as {
        n: string;
        m: string;
        y: string;
        c: string;
        h?: string;
      };
      return {
        number: parsed.n,
        expMonth: parsed.m,
        expYear: parsed.y,
        cvc: parsed.c,
        holder: parsed.h,
      };
    } catch {
      throw new MokaApiError('Invalid Moka cardToken format');
    }
  }
}
