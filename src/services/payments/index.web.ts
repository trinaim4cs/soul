import { isCheckoutUrl, startCheckout } from './start';
import type { PaymentService } from './types';

export type { CheckoutResult, PaymentService } from './types';

/**
 * The web app (PWA) goes to Razorpay's checkout page in the same tab, and Razorpay sends it
 * back to `/pay/return`, which asks the server what happened. No third-party script is ever
 * loaded into SOUL's own pages (the CSP stays `script-src 'self'`).
 */
export const payments: PaymentService = {
  async checkout(catalogItemId) {
    const start = await startCheckout(catalogItemId, 'web');
    if (!start.ok) return { status: 'unavailable', reason: start.reason };
    if (start.provider === 'mock') return { status: 'mock', orderId: start.order_id };
    if (!start.url || !isCheckoutUrl(start.url))
      return { status: 'unavailable', reason: 'invalid' };
    window.location.assign(start.url);
    return { status: 'redirected', orderId: start.order_id };
  },
};
