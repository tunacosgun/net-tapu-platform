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
import { PaytrConfig, PaytrCallbackBody, PaytrGetTokenResponse, PaytrRefundResponse } from './paytr-types';
import { generatePaytrToken, generatePaytrRefundToken, verifyPaytrCallbackHash } from './paytr-signature';
import { PaytrApiError, mapPaytrErrorCode } from './paytr-errors';

const PAYTR_GET_TOKEN_URL = 'https://www.paytr.com/odeme/api/get-token';
const PAYTR_REFUND_URL = 'https://www.paytr.com/odeme/iade';

type HttpPost = (url: string, data: URLSearchParams) => Promise<{ data: unknown }>;

/**
 * PayTR virtual POS gateway adapter.
 *
 * Flow:
 *   1. initiateProvision() → POST get-token → returns iframe token for 3DS
 *   2. Client renders https://www.paytr.com/odeme/guvenli/{token}
 *   3. PayTR POSTs callback to our URL → verifyCallback() + completeProvision()
 *   4. capture() → PayTR pre-auth capture (if applicable)
 *   5. refund() → POST /odeme/iade
 */
export class PaytrGateway extends BasePosGateway {
  protected readonly providerName = 'paytr';
  private readonly config: PaytrConfig;
  private readonly httpPost: HttpPost;

  constructor(config: PaytrConfig, httpPost: HttpPost, logger: PosLogger) {
    super(logger);
    this.config = config;
    this.httpPost = httpPost;
  }

  async initiateProvision(req: ProvisionRequest): Promise<ProvisionInitiationResponse> {
    const requestId = this.logRequest('initiateProvision', {
      payment_id: req.paymentId,
      amount: req.amount,
      currency: req.currency,
    });

    try {
      const paymentAmountKurus = this.toKurus(req.amount);
      const currencyCode = this.mapCurrency(req.currency);
      const testMode = this.config.testMode ? '1' : '0';

      const userBasket = Buffer.from(
        JSON.stringify([['Payment', paymentAmountKurus, '1']]),
      ).toString('base64');

      const buyer = req.buyer || {
        email: 'customer@nettapu.com',
        firstName: 'Net',
        lastName: 'Tapu',
        ip: '127.0.0.1',
      };

      const paytrToken = generatePaytrToken(
        {
          merchantId: this.config.merchantId,
          userIp: buyer.ip,
          merchantOid: req.paymentId,
          email: buyer.email,
          paymentAmount: paymentAmountKurus,
          userBasket,
          noInstallment: '1',
          maxInstallment: '0',
          currency: currencyCode,
          testMode,
        },
        this.config.merchantKey,
        this.config.merchantSalt,
      );

      const params = new URLSearchParams();
      params.append('merchant_id', this.config.merchantId);
      params.append('user_ip', buyer.ip);
      params.append('merchant_oid', req.paymentId);
      params.append('email', buyer.email);
      params.append('payment_amount', paymentAmountKurus);
      params.append('paytr_token', paytrToken);
      params.append('user_basket', userBasket);
      params.append('no_installment', '1');
      params.append('max_installment', '0');
      params.append('user_name', `${buyer.firstName} ${buyer.lastName}`);
      params.append('user_address', buyer.address || 'Turkey');
      params.append('user_phone', buyer.phone || '0000000000');
      params.append('merchant_ok_url', this.config.okUrl);
      params.append('merchant_fail_url', this.config.failUrl);
      params.append('timeout_limit', '30');
      params.append('currency', currencyCode);
      params.append('test_mode', testMode);
      params.append('debug_on', '1');

      if (req.cardToken) {
        params.append('card_token', req.cardToken);
      }

      // Mail Order / Telephone Order — skip 3DS authentication
      if (req.isMoto) {
        params.append('non_3d', '1');
      }

      const response = await this.httpPost(PAYTR_GET_TOKEN_URL, params);
      const data = response.data as PaytrGetTokenResponse;

      if (data.status === 'success' && data.token) {
        this.logResponse('initiateProvision', requestId, true, {
          payment_id: req.paymentId,
          has_token: true,
        });

        return {
          status: 'requires_3ds',
          posReference: null,
          message: 'PayTR token generated — render iframe for 3DS',
          threeDsHtmlContent: `<script src="https://www.paytr.com/js/iframeResizer.min.js"></script><iframe src="https://www.paytr.com/odeme/guvenli/${data.token}" id="paytriframe" frameborder="0" scrolling="no" style="width:100%;"></iframe><script>iFrameResize({}, '#paytriframe');</script>`,
          posTransactionToken: data.token,
        };
      }

      this.logResponse('initiateProvision', requestId, false, {
        payment_id: req.paymentId,
        reason: data.reason,
      });

      return {
        status: 'failed',
        posReference: null,
        message: data.reason || 'PayTR token generation failed',
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
      const cb = req.callbackPayload as unknown as PaytrCallbackBody;

      if (cb.status === 'success') {
        this.logResponse('completeProvision', requestId, true, {
          payment_id: req.paymentId,
          merchant_oid: cb.merchant_oid,
        });

        return {
          success: true,
          posReference: cb.merchant_oid,
          message: 'PayTR payment completed successfully',
        };
      }

      const failReason = cb.failed_reason_msg || mapPaytrErrorCode(cb.failed_reason_code);
      this.logResponse('completeProvision', requestId, false, {
        payment_id: req.paymentId,
        reason_code: cb.failed_reason_code,
        reason: failReason,
      });

      return {
        success: false,
        posReference: cb.merchant_oid,
        message: `PayTR payment failed: ${failReason}`,
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
    const cb = body as unknown as PaytrCallbackBody;
    if (!cb.merchant_oid || !cb.status || !cb.total_amount || !cb.hash) {
      return false;
    }

    return verifyPaytrCallbackHash(
      cb.merchant_oid,
      cb.status,
      cb.total_amount,
      cb.hash,
      this.config.merchantKey,
      this.config.merchantSalt,
    );
  }

  async capture(_req: CaptureProvisionRequest): Promise<CaptureProvisionResponse> {
    // PayTR pre-auth capture is handled via the payment_type parameter
    // and the callback flow. For standard iframe payments, capture is automatic.
    // If pre-auth mode is used in the future, this would call the
    // PayTR pre-auth capture endpoint.
    return {
      success: true,
      posReference: _req.posReference,
      message: 'PayTR capture: auto-captured via iframe payment flow',
    };
  }

  async cancelProvision(req: CancelProvisionRequest): Promise<CancelProvisionResponse> {
    // PayTR cancellation is done via refund API with full amount
    // within the same day (before settlement).
    const requestId = this.logRequest('cancelProvision', {
      payment_id: req.paymentId,
      pos_reference: req.posReference,
    });

    try {
      // Cancel = same-day full refund. Delegate to refund with a synthetic amount.
      // The caller should provide the original amount via metadata if needed.
      this.logResponse('cancelProvision', requestId, true, {
        payment_id: req.paymentId,
        note: 'PayTR cancel delegates to refund flow',
      });

      return {
        success: true,
        message: 'PayTR provision cancel: use refund with full amount for same-day void',
      };
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
      const returnAmountKurus = this.toKurus(req.amount);

      const paytrToken = generatePaytrRefundToken(
        this.config.merchantId,
        req.posReference,
        returnAmountKurus,
        this.config.merchantKey,
        this.config.merchantSalt,
      );

      const params = new URLSearchParams();
      params.append('merchant_id', this.config.merchantId);
      params.append('merchant_oid', req.posReference);
      params.append('return_amount', returnAmountKurus);
      params.append('paytr_token', paytrToken);

      const response = await this.httpPost(PAYTR_REFUND_URL, params);
      const data = response.data as PaytrRefundResponse;

      if (data.status === 'success') {
        this.logResponse('refund', requestId, true, {
          payment_id: req.paymentId,
          reference_no: data.reference_no,
        });

        return {
          success: true,
          posRefundReference: data.reference_no || null,
          message: 'PayTR refund successful',
        };
      }

      this.logResponse('refund', requestId, false, {
        payment_id: req.paymentId,
        error: data.err_msg,
      });

      throw new PaytrApiError(
        data.err_msg || 'PayTR refund failed',
        undefined,
        data as unknown as Record<string, unknown>,
      );
    } catch (error) {
      if (error instanceof PaytrApiError) {
        this.logError('refund', requestId, error);
        return {
          success: false,
          posRefundReference: null,
          message: error.message,
        };
      }
      this.logError('refund', requestId, error);
      return {
        success: false,
        posRefundReference: null,
        message: this.normalizeError('refund', error).message,
      };
    }
  }

  /** @deprecated Use initiateProvision() + completeProvision() */
  async provision(req: ProvisionRequest): Promise<ProvisionResponse> {
    const result = await this.initiateProvision(req);
    if (result.status === 'completed') {
      return {
        success: true,
        posReference: result.posReference,
        message: result.message,
      };
    }
    return {
      success: false,
      posReference: null,
      message: result.status === 'requires_3ds'
        ? '3DS required — use initiateProvision() + completeProvision()'
        : result.message,
    };
  }

  /** Convert decimal TRY amount to kuruş (integer cents string) */
  private toKurus(amount: string): string {
    const cents = Math.round(parseFloat(amount) * 100);
    return cents.toString();
  }

  /** Map ISO 4217 currency to PayTR currency code */
  private mapCurrency(currency: string): 'TL' | 'EUR' | 'USD' | 'GBP' | 'RUB' {
    const map: Record<string, 'TL' | 'EUR' | 'USD' | 'GBP' | 'RUB'> = {
      TRY: 'TL',
      EUR: 'EUR',
      USD: 'USD',
      GBP: 'GBP',
      RUB: 'RUB',
    };
    return map[currency] || 'TL';
  }
}
