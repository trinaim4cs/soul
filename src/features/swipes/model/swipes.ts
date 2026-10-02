import { z } from 'zod';

/** One catalog row (`plans`). Prices, quotas and Instant rules always come from the server. */
export const planSchema = z.object({
  id: z.string(),
  kind: z.enum(['subscription', 'topup']),
  title: z.string(),
  price_paise: z.number().int().positive(),
  right_swipes: z.number().int().positive(),
  period_label: z.string().nullable(),
  includes_instant: z.boolean(),
  sort_order: z.number().int(),
});
export type Plan = z.infer<typeof planSchema>;

const currentPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  ends_at: z.string(),
  includes_instant: z.boolean(),
});

/** `get_my_swipes()`: the balance is computed on the server (DECISIONS D-013). */
export const swipesSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    balance: z.number().int().nonnegative(),
    buckets: z.object({
      free: z.number().int().nonnegative(),
      plan: z.number().int().nonnegative(),
      topup: z.number().int().nonnegative(),
    }),
    plan: currentPlanSchema.nullable(),
    instant: z.boolean(),
  }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type SwipeBalance = Extract<z.infer<typeof swipesSchema>, { ok: true }>;

/** "₹199" for whole rupees, "₹49.50" otherwise. */
export function formatPrice(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}

/**
 * Spoken price: "₹199 for 1 month" for a plan, "₹50" for a top-up. On screen the row shows
 * the price alone, because the title already names the period and nothing renews by itself.
 */
export function priceSpoken(plan: Plan): string {
  const price = formatPrice(plan.price_paise);
  return plan.period_label ? `${price} for ${plan.period_label}` : price;
}

/** The app says "likes"; the spec and the legal texts call them right swipes. */
export function likesLabel(count: number): string {
  return count === 1 ? '1 like' : `${count} likes`;
}

export function likesLeftLabel(count: number): string {
  return count === 0 ? 'No likes left' : `${likesLabel(count)} left`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2 Nov" in the device's own time zone. */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** One line for settings and the plans screen: "3 likes left · Monthly until 2 Nov". */
export function balanceSummary(swipes: SwipeBalance): string {
  const likes = likesLeftLabel(swipes.balance);
  return swipes.plan
    ? `${likes} · ${swipes.plan.title} until ${shortDate(swipes.plan.ends_at)}`
    : likes;
}

/** What a plan gives, in the order people care about. */
export function planDetail(plan: Plan): string {
  const likes = likesLabel(plan.right_swipes);
  if (plan.kind === 'topup') return 'Never expire';
  return plan.includes_instant ? `${likes} · Instant Meet` : likes;
}

export function splitCatalog(plans: Plan[]) {
  const sorted = [...plans].sort((a, b) => a.sort_order - b.sort_order);
  return {
    subscriptions: sorted.filter((plan) => plan.kind === 'subscription'),
    topups: sorted.filter((plan) => plan.kind === 'topup'),
  };
}
