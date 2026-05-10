// ── Moka United (refmoka) API Request / Response Types ─────
// Ref: https://developer.moka.com/

export interface MokaConfig {
  /** Moka dealer code (Bayi Kodu) */
  dealerCode: string;
  /** API username */
  username: string;
  /** API password */
  password: string;
  /** Index used in the auth hash (CheckKey) — provided by Moka */
  shaIndex: string;
  /** REST base URL — sandbox: https://service.testmoka.com, prod: https://service.moka.com */
  baseUrl: string;
  /** Where Moka redirects/POSTs after 3DS — used as ReturnUrl */
  callbackUrl: string;
  /** Whether running in test/sandbox mode */
  testMode: boolean;
}

/** Authentication block — every Moka request requires this */
export interface MokaAuth {
  DealerCode: string;
  Username: string;
  Password: string;
  CheckKey: string;
}

// ── DoDirectPayment3dRequestHandler ────────────────────────
// 3DS initiation. Returns CodeForHash that maps to a hosted 3DS page.

export interface MokaDirectPayment3dRequest {
  PaymentDealerAuthentication: MokaAuth;
  PaymentDealerRequest: {
    CardHolderFullName: string;
    CardNumber: string;
    ExpMonth: string;       // MM
    ExpYear: string;        // YYYY
    CvcNumber: string;
    Amount: number;         // decimal (e.g. 100.50)
    Currency: 'TL' | 'USD' | 'EUR' | 'GBP';
    InstallmentNumber: number; // 0 = single payment
    ClientIP: string;
    OtherTrxCode: string;     // our paymentId
    Software: string;
    Description?: string;
    ReturnHash: 1;            // request hash callback
    RedirectUrl: string;      // = MokaConfig.callbackUrl
    RedirectType: 0 | 1;      // 0 = no redirect, 1 = redirect after 3DS
    IsPreAuth?: 0 | 1;
    IsPoolPayment?: 0 | 1;
    /** Mail order — bypasses 3DS on Moka */
    IsMailOrderTransaction?: 0 | 1;
    BuyerInformation?: {
      BuyerFullName?: string;
      BuyerEmail?: string;
      BuyerGsmNumber?: string;
      BuyerAddress?: string;
    };
    BasketProduct?: Array<{
      ProductId: number | string;
      ProductCode: string;
      UnitPrice: number;
      Quantity: number;
    }>;
  };
}

export interface MokaDirectPayment3dResponse {
  Data: {
    Url?: string;
    CodeForHash?: string;
  } | null;
  IsSuccessful: boolean;
  ResultCode: string;
  ResultMessage: string;
  Exception: string | null;
}

// ── PaymentDealerCallback — POSTed back after 3DS ──────────
// Body posted to RedirectUrl. ReturnHash is HMAC over key fields.

export interface MokaCallbackBody {
  /** Our payment ID echoed back */
  OtherTrxCode: string;
  /** Moka's transaction id */
  trxCode?: string;
  /** Result: '1' = success, anything else = failed */
  resultCode: string;
  resultMessage?: string;
  /** Echoed payment amount */
  amount?: string;
  /** Hash for verification — see verify util */
  hashValue?: string;
  /** Bank-issued auth code */
  authCode?: string;
  /** Additional fields Moka may send */
  [k: string]: unknown;
}

// ── DoVoid — cancel a same-day provision ───────────────────

export interface MokaVoidRequest {
  PaymentDealerAuthentication: MokaAuth;
  VoidRequest: {
    OtherTrxCode?: string;
    VirtualPosOrderId?: string;
  };
}

export interface MokaVoidResponse {
  Data: { IsSuccessful?: boolean } | null;
  IsSuccessful: boolean;
  ResultCode: string;
  ResultMessage: string;
  Exception: string | null;
}

// ── DoCapture — capture a previously provisioned amount ────

export interface MokaCaptureRequest {
  PaymentDealerAuthentication: MokaAuth;
  CaptureRequest: {
    OtherTrxCode?: string;
    VirtualPosOrderId?: string;
    Amount: number;
    Currency: string;
  };
}

export interface MokaCaptureResponse {
  Data: { IsSuccessful?: boolean; VirtualPosOrderId?: string } | null;
  IsSuccessful: boolean;
  ResultCode: string;
  ResultMessage: string;
  Exception: string | null;
}

// ── DoRefund ──────────────────────────────────────────────

export interface MokaRefundRequest {
  PaymentDealerAuthentication: MokaAuth;
  RefundRequest: {
    OtherTrxCode?: string;
    VirtualPosOrderId?: string;
    Amount: number;
    Currency: string;
  };
}

export interface MokaRefundResponse {
  Data: { RefundCode?: string; IsSuccessful?: boolean } | null;
  IsSuccessful: boolean;
  ResultCode: string;
  ResultMessage: string;
  Exception: string | null;
}

// ── GetDealerPaymentTransaction (status query for reconciliation) ─

export interface MokaQueryRequest {
  PaymentDealerAuthentication: MokaAuth;
  PaymentDealerRequest: {
    OtherTrxCode?: string;
    VirtualPosOrderId?: string;
  };
}

export interface MokaQueryResponse {
  Data:
    | {
        TrxStatus?: number;
        Amount?: number;
        Currency?: string;
        VirtualPosOrderId?: string;
      }
    | null;
  IsSuccessful: boolean;
  ResultCode: string;
  ResultMessage: string;
  Exception: string | null;
}
