/**
 * Payment contract (DECISIONS D-037, D-052). Both platforms open SOUL's web checkout for a
 * server catalog item: Android in an in-app browser tab, the web app by navigating to it.
 * Nothing is granted by the client: the provider's signed webhook grants on the server, and
 * the app re-reads its entitlement afterwards. Returning from checkout proves nothing.
 */
export type CheckoutResult =
  /** Android came back from checkout; the server decides whether it was paid. */
  | { status: 'returned'; orderId: string }
  /** The web app is navigating to checkout and will come back to `/pay/return`. */
  | { status: 'redirected'; orderId: string }
  /** Development only: the server uses the mock provider; open the in-app test checkout. */
  | { status: 'mock'; orderId: string }
  /** The server is not taking payments (not configured, closed, or this item is not sold). */
  | { status: 'unavailable'; reason: string };

export type PaymentService = {
  /** `catalogItemId` is a server catalog key; the price always comes from the server. */
  checkout(catalogItemId: string): Promise<CheckoutResult>;
};
