import type { RazorpayKeys } from './razorpay.ts';

// Payment configuration (DECISIONS D-052). Every value is a server secret; nothing here is
// ever in the app. Set with `supabase secrets set` (hosted) or `supabase/functions/.env` (local).
//   PAYMENTS_PROVIDER         razorpay | mock
//   SOUL_ENV                  only `development` may use the mock provider (unset counts as not)
//   PAYMENTS_SITE_URL         the SOUL website that receives the return from checkout
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET

export type Provider = 'razorpay' | 'mock' | 'none';

const read = (name: string) => Deno.env.get(name)?.trim() ?? '';

/**
 * The mock provider grants plans without a payment, so it needs an explicit development
 * deployment: a missing or mistyped SOUL_ENV keeps it off (fails closed, Phase 18).
 */
export function isDevelopment(): boolean {
  return read('SOUL_ENV') === 'development';
}

export function razorpayKeys(): RazorpayKeys | null {
  const keyId = read('RAZORPAY_KEY_ID');
  const keySecret = read('RAZORPAY_KEY_SECRET');
  return keyId && keySecret ? { keyId, keySecret } : null;
}

export function webhookSecret(): string {
  return read('RAZORPAY_WEBHOOK_SECRET');
}

/** The provider this deployment uses; `none` when it is not fully configured. */
export function paymentProvider(): Provider {
  const configured = read('PAYMENTS_PROVIDER');
  if (configured === 'razorpay' && razorpayKeys() && webhookSecret()) return 'razorpay';
  if (configured === 'mock' && isDevelopment() && webhookSecret()) return 'mock';
  return 'none';
}

/**
 * Where checkout sends the person back. The web app has a route for it; the Android app
 * gets a tiny static page that hands the order to `com.soul.srm://pay/return`.
 * Built only from server configuration, never from anything the client sends.
 */
export function returnUrl(orderId: string, platform: 'android' | 'web'): string {
  const site = read('PAYMENTS_SITE_URL').replace(/\/+$/, '');
  if (!site) throw new Error('missing PAYMENTS_SITE_URL');
  const path = platform === 'android' ? '/pay-return.html' : '/pay/return';
  return `${site}${path}?order=${encodeURIComponent(orderId)}`;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
