import type { PaymentService } from './types';

export type { CheckoutResult, PaymentService } from './types';

/**
 * Checkout arrives with the Razorpay web flow in Phase 12 (DECISIONS D-037). Until then no
 * build can take a payment, and no build can ever grant a plan or likes by itself: only the
 * server does, after the provider's signed webhook.
 */
export const payments: PaymentService = {
  checkout: () => Promise.resolve('unavailable'),
};
