/**
 * Payment contract (DECISIONS D-037, Phase 12). Both platforms open SOUL's web checkout for a
 * server catalog item (native: in-app browser; web: redirect). Nothing is granted by the
 * client: the provider's signed webhook grants on the server, and the app re-reads its
 * entitlement afterwards.
 */
export type CheckoutResult =
  | 'completed'
  | 'cancelled'
  | 'failed'
  /** Checkout is not open on this build yet (before Phase 12). Nothing was charged. */
  | 'unavailable';

export type PaymentService = {
  /** `catalogItemId` is a server catalog key; the price always comes from the server. */
  checkout(catalogItemId: string): Promise<CheckoutResult>;
};
