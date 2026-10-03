import * as WebBrowser from 'expo-web-browser';

import { isCheckoutUrl, startCheckout } from './start';
import type { PaymentService } from './types';

export type { CheckoutResult, PaymentService } from './types';

/** Where the static return page sends the browser tab back to (DECISIONS D-052). */
const RETURN_URL = 'com.soul.srm://pay/return';

/**
 * Android: Razorpay's checkout opens in an in-app browser tab (Custom Tabs), so the person
 * sees the real payment page and its address. When it sends them back, the tab closes and the
 * app asks the server what happened; nothing is granted on the device.
 */
export const payments: PaymentService = {
  async checkout(catalogItemId) {
    const start = await startCheckout(catalogItemId, 'android');
    if (!start.ok) return { status: 'unavailable', reason: start.reason };
    if (start.provider === 'mock') return { status: 'mock', orderId: start.order_id };
    if (!start.url || !isCheckoutUrl(start.url))
      return { status: 'unavailable', reason: 'invalid' };
    await WebBrowser.openAuthSessionAsync(start.url, RETURN_URL, { showInRecents: false });
    return { status: 'returned', orderId: start.order_id };
  },
};
