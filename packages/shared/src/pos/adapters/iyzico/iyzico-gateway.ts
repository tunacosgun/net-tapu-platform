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
  IyzicoConfig,
  IyzicoCheckoutInitResponse,
  IyzicoCheckoutAuthResponse,
  IyzicoApproveResponse,
  IyzicoRefundResponse,
} from './iyzico-types';
import { generateIyzicoAuthHeader, buildPkiString, generateRandomString } from './iyzico-signature';
import { IyzicoApiError, mapIyzicoError } from './iyzico-errors';

type HttpPost = (url: string, body: unknown, headers: Record<string, string>) => Promise<{ data: unknown }>;

/**
 * iyzico virtual POS gateway adapter.
 *
 * Flow:
 *   1. initiateProvision() → POST /checkoutform/initialize → returns checkout form HTML
 *   2. Client renders checkout form → user completes payment
 *   3. iyzico calls our callback URL → we POST /checkoutform/auth to get result
 *   4. capture() → POST /payment/approve (for marketplace model)
 *   5. refund() → POST /payment/refund
 */
export class IyzicoGateway extends BasePosGateway {
  protected readonly providerName = 'iyzico';
  private readonly config: IyzicoConfig;
  private readonly httpPost: HttpPost;

  constructor(config: IyzicoConfig, httpPost: HttpPost, logger: PosLogger) {
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
      const buyer = req.buyer || {
        email: 'customer@nettapu.com',
        firstName: 'Net',
        lastName: 'Tapu',
        ip: '127.0.0.1',
      };

      const requestBody = {
        locale: 'tr',
        conversationId: req.paymentId,
        price: req.amount,
        paidPrice: req.amount,
        currency: this.mapCurrency(req.currency),
        basketId: req.paymentId,
        paymentGroup: 'PRODUCT',
        // Mail order channel — bypasses 3DS authentication
        ...(req.isMoto ? { paymentChannel: 'MOTO' } : {}),
        callbackUrl: this.config.callbackUrl,
        buyer: {
          id: req.paymentId,
          name: buyer.firstName,
          surname: buyer.lastName,
          email: buyer.email,
          identityNumber: '11111111111',
          registrationAddress: buyer.address || 'Turkey',
          ip: buyer.ip,
          city: buyer.city || 'Istanbul',
          country: buyer.country || 'Turkey',
          gsmNumber: buyer.phone,
        },
        shippingAddress: {
          contactName: `${buyer.firstName} ${buyer.lastName}`,
          city: buyer.city || 'Istanbul',
          country: buyer.country || 'Turkey',
          address: buyer.address || 'Turkey',
        },
        billingAddress: {
          contactName: `${buyer.firstName} ${buyer.lastName}`,
          city: buyer.city || 'Istanbul',
          country: buyer.country || 'Turkey',
          address: buyer.address || 'Turkey',
        },
        basketItems: [
          {
            id: req.paymentId,
            name: 'Payment',
            category1: 'Real Estate',
            itemType: 'VIRTUAL',
            price: req.amount,
          },
        ],
      };

      const pkiString = buildPkiString(requestBody);
      const randomStr = generateRandomString();
      const authHeader = generateIyzicoAuthHeader(
        this.config.apiKey,
        this.config.secretKey,
        randomStr,
        pkiString,
      );

      const response = await this.httpPost(
        `${this.config.baseUrl}/payment/iyzipos/checkoutform/initialize/auth/ecom`,
        requestBody,
        {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'x-iyzi-rnd': randomStr,
        },
      );

      const data = response.data as IyzicoCheckoutInitResponse;

      if (data.status === 'success' && data.token) {
        this.logResponse('initiateProvision', requestId, true, {
          payment_id: req.paymentId,
          has_token: true,
        });

        return {
          status: 'requires_3ds',
          posReference: null,
          message: 'iyzico checkout form generated — render for 3DS',
          threeDsHtmlContent: data.checkoutFormContent,
          threeDsRedirectUrl: data.paymentPageUrl,
          posTransactionToken: data.token,
        };
      }

      this.logResponse('initiateProvision', requestId, false, {
        payment_id: req.paymentId,
        error_code: data.errorCode,
        error: data.errorMessage,
      });

      return {
        status: 'failed',
        posReference: null,
        message: mapIyzicoError(data.errorCode, data.errorMessage),
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
    });

    try {
      // For iyzico, completeProvision calls the checkout form auth endpoint
      // to retrieve the payment result using the token
      const requestBody = {
        locale: 'tr',
        conversationId: req.paymentId,
        token: req.posTransactionToken,
      };

      const pkiString = buildPkiString(requestBody);
      const randomStr = generateRandomString();
      const authHeader = generateIyzicoAuthHeader(
        this.config.apiKey,
        this.config.secretKey,
        randomStr,
        pkiString,
      );

      const response = await this.httpPost(
        `${this.config.baseUrl}/payment/iyzipos/checkoutform/auth/ecom/detail`,
        requestBody,
        {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'x-iyzi-rnd': randomStr,
        },
      );

      const data = response.data as IyzicoCheckoutAuthResponse;

      if (data.status === 'success' && data.paymentId) {
        this.logResponse('completeProvision', requestId, true, {
          payment_id: req.paymentId,
          iyzico_payment_id: data.paymentId,
        });

        return {
          success: true,
          posReference: data.paymentId,
          message: 'iyzico payment completed successfully',
        };
      }

      this.logResponse('completeProvision', requestId, false, {
        payment_id: req.paymentId,
        error_code: data.errorCode,
        error: data.errorMessage,
      });

      return {
        success: false,
        posReference: data.paymentId || null,
        message: mapIyzicoError(data.errorCode, data.errorMessage),
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

  verifyCallback(_headers: Record<string, string>, _body: Record<string, unknown>): boolean {
    // iyzico callback verification is done by calling checkoutform/auth
    // with the token — the token itself acts as verification.
    // If the token is valid, the auth call succeeds.
    // We verify by checking that the token exists in the callback body.
    const token = _body.token as string | undefined;
    return !!token;
  }

  async capture(req: CaptureProvisionRequest): Promise<CaptureProvisionResponse> {
    const requestId = this.logRequest('capture', {
      payment_id: req.paymentId,
      pos_reference: req.posReference,
    });

    try {
      const requestBody = {
        locale: 'tr',
        conversationId: req.paymentId,
        paymentTransactionId: req.posReference,
      };

      const pkiString = buildPkiString(requestBody);
      const randomStr = generateRandomString();
      const authHeader = generateIyzicoAuthHeader(
        this.config.apiKey,
        this.config.secretKey,
        randomStr,
        pkiString,
      );

      const response = await this.httpPost(
        `${this.config.baseUrl}/payment/iyzipos/item/approve`,
        requestBody,
        {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'x-iyzi-rnd': randomStr,
        },
      );

      const data = response.data as IyzicoApproveResponse;

      if (data.status === 'success') {
        this.logResponse('capture', requestId, true, {
          payment_id: req.paymentId,
        });

        return {
          success: true,
          posReference: data.paymentId || req.posReference,
          message: 'iyzico capture successful',
        };
      }

      throw new IyzicoApiError(
        mapIyzicoError(data.errorCode, data.errorMessage),
        data.errorCode,
        data as unknown as Record<string, unknown>,
      );
    } catch (error) {
      this.logError('capture', requestId, error);
      return {
        success: false,
        posReference: null,
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
      const requestBody = {
        locale: 'tr',
        conversationId: req.paymentId,
        paymentId: req.posReference,
        ip: '127.0.0.1',
      };

      const pkiString = buildPkiString(requestBody);
      const randomStr = generateRandomString();
      const authHeader = generateIyzicoAuthHeader(
        this.config.apiKey,
        this.config.secretKey,
        randomStr,
        pkiString,
      );

      const response = await this.httpPost(
        `${this.config.baseUrl}/payment/iyzipos/cancel`,
        requestBody,
        {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'x-iyzi-rnd': randomStr,
        },
      );

      const data = response.data as IyzicoApproveResponse;

      if (data.status === 'success') {
        this.logResponse('cancelProvision', requestId, true, {
          payment_id: req.paymentId,
        });

        return { success: true, message: 'iyzico cancel successful' };
      }

      throw new IyzicoApiError(
        mapIyzicoError(data.errorCode, data.errorMessage),
        data.errorCode,
        data as unknown as Record<string, unknown>,
      );
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
      const requestBody = {
        locale: 'tr',
        conversationId: req.paymentId,
        paymentTransactionId: req.posReference,
        price: req.amount,
        currency: this.mapCurrency(req.currency),
        ip: '127.0.0.1',
      };

      const pkiString = buildPkiString(requestBody);
      const randomStr = generateRandomString();
      const authHeader = generateIyzicoAuthHeader(
        this.config.apiKey,
        this.config.secretKey,
        randomStr,
        pkiString,
      );

      const response = await this.httpPost(
        `${this.config.baseUrl}/payment/iyzipos/refund`,
        requestBody,
        {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'x-iyzi-rnd': randomStr,
        },
      );

      const data = response.data as IyzicoRefundResponse;

      if (data.status === 'success') {
        this.logResponse('refund', requestId, true, {
          payment_id: req.paymentId,
          iyzico_payment_id: data.paymentId,
        });

        return {
          success: true,
          posRefundReference: data.paymentTransactionId || null,
          message: 'iyzico refund successful',
        };
      }

      throw new IyzicoApiError(
        mapIyzicoError(data.errorCode, data.errorMessage),
        data.errorCode,
        data as unknown as Record<string, unknown>,
      );
    } catch (error) {
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
      return { success: true, posReference: result.posReference, message: result.message };
    }
    return {
      success: false,
      posReference: null,
      message: result.status === 'requires_3ds'
        ? '3DS required — use initiateProvision() + completeProvision()'
        : result.message,
    };
  }

  async queryTransactionStatus(posReference: string): Promise<TransactionStatusResponse> {
    const requestId = this.logRequest('queryTransactionStatus', {
      pos_reference: posReference,
    });

    try {
      const requestBody = {
        locale: 'tr',
        conversationId: posReference,
        paymentId: posReference,
      };

      const pkiString = buildPkiString(requestBody);
      const randomStr = generateRandomString();
      const authHeader = generateIyzicoAuthHeader(
        this.config.apiKey,
        this.config.secretKey,
        randomStr,
        pkiString,
      );

      const response = await this.httpPost(
        `${this.config.baseUrl}/payment/iyzipos/reporting/payment/detail`,
        requestBody,
        {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'x-iyzi-rnd': randomStr,
        },
      );

      const data = response.data as IyzicoCheckoutAuthResponse;

      this.logResponse('queryTransactionStatus', requestId, data.status === 'success', {
        pos_reference: posReference,
      });

      if (data.status === 'success') {
        return {
          found: true,
          status: data.paymentStatus || 'unknown',
          amount: data.price?.toString(),
          currency: data.currency,
          posReference: data.paymentId,
          rawResponse: data as unknown as Record<string, unknown>,
        };
      }

      return { found: false, status: 'not_found' };
    } catch (error) {
      this.logError('queryTransactionStatus', requestId, error);
      return { found: false, status: 'error' };
    }
  }

  private mapCurrency(currency: string): 'TRY' | 'EUR' | 'USD' | 'GBP' {
    const map: Record<string, 'TRY' | 'EUR' | 'USD' | 'GBP'> = {
      TRY: 'TRY',
      EUR: 'EUR',
      USD: 'USD',
      GBP: 'GBP',
    };
    return map[currency] || 'TRY';
  }
}
