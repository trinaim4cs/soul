/** Checkout links come only from Razorpay; anything else is never opened. */
export function isCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && /(^|\.)(rzp\.io|razorpay\.com)$/.test(parsed.hostname);
  } catch {
    return false;
  }
}
