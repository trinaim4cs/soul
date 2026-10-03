import { z } from 'zod';

import { supabase } from '@/lib/supabase';

export { isCheckoutUrl } from './checkout-url';

const startSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    provider: z.enum(['razorpay', 'mock']),
    order_id: z.string().uuid(),
    url: z.string().url().optional(),
  }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type CheckoutStart = z.infer<typeof startSchema>;

/** Asks the server to start a purchase: an order at the catalog price and a checkout link. */
export async function startCheckout(
  catalogItemId: string,
  platform: 'android' | 'web',
): Promise<CheckoutStart> {
  const { data, error } = await supabase.functions.invoke('payments-checkout', {
    body: { plan: catalogItemId, platform },
  });
  if (error) throw error;
  return startSchema.parse(data);
}
