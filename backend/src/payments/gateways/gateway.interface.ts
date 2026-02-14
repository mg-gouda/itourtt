export interface PaymentSessionResult {
  sessionId: string;
  checkoutUrl: string;
  gateway: string;
}

export interface PaymentVerificationResult {
  success: boolean;
  transactionId: string;
  amount: number;
  currency: string;
}

export interface PaymentGateway {
  createSession(
    bookingRef: string,
    amount: number,
    currency: string,
    returnUrl: string,
    cancelUrl: string,
  ): Promise<PaymentSessionResult>;

  verifyPayment(sessionId: string): Promise<PaymentVerificationResult>;

  refund(
    transactionId: string,
    amount: number,
  ): Promise<{ success: boolean; refundId: string }>;
}
