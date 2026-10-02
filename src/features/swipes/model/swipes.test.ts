import {
  balanceSummary,
  formatPrice,
  likesLabel,
  likesLeftLabel,
  planDetail,
  priceSpoken,
  splitCatalog,
  swipesSchema,
  type Plan,
  type SwipeBalance,
} from './swipes';

const plan = (over: Partial<Plan>): Plan => ({
  id: 'monthly',
  kind: 'subscription',
  title: 'Monthly',
  price_paise: 19900,
  right_swipes: 25,
  period_label: '1 month',
  includes_instant: true,
  sort_order: 20,
  ...over,
});

const balance = (over: Partial<SwipeBalance>): SwipeBalance => ({
  ok: true,
  balance: 3,
  buckets: { free: 3, plan: 0, topup: 0 },
  plan: null,
  instant: false,
  ...over,
});

describe('prices', () => {
  it('shows whole rupees without decimals', () => {
    expect(formatPrice(19900)).toBe('₹199');
    expect(formatPrice(5000)).toBe('₹50');
    expect(formatPrice(4950)).toBe('₹49.50');
  });

  it('speaks the period for plans only', () => {
    expect(priceSpoken(plan({}))).toBe('₹199 for 1 month');
    expect(priceSpoken(plan({ kind: 'topup', period_label: null, price_paise: 5000 }))).toBe('₹50');
  });
});

describe('copy', () => {
  it('counts likes', () => {
    expect(likesLabel(1)).toBe('1 like');
    expect(likesLabel(12)).toBe('12 likes');
    expect(likesLeftLabel(0)).toBe('No likes left');
    expect(likesLeftLabel(1)).toBe('1 like left');
  });

  it('says what each option gives', () => {
    expect(planDetail(plan({}))).toBe('25 likes · Instant Meet');
    expect(planDetail(plan({ id: 'weekly', includes_instant: false, right_swipes: 15 }))).toBe(
      '15 likes',
    );
    expect(planDetail(plan({ kind: 'topup', includes_instant: false }))).toBe('Never expire');
  });

  it('summarises the balance with the plan end date', () => {
    expect(balanceSummary(balance({}))).toBe('3 likes left');
    const ends = new Date(2026, 10, 2, 12).toISOString();
    expect(
      balanceSummary(
        balance({
          balance: 28,
          plan: { id: 'monthly', title: 'Monthly', ends_at: ends, includes_instant: true },
        }),
      ),
    ).toBe('28 likes left · Monthly until 2 Nov');
  });
});

describe('catalog', () => {
  it('splits and orders plans and top-ups by the server order', () => {
    const catalog = splitCatalog([
      plan({ id: 'topup_12', kind: 'topup', sort_order: 120 }),
      plan({ id: 'monthly', sort_order: 20 }),
      plan({ id: 'topup_5', kind: 'topup', sort_order: 110 }),
      plan({ id: 'weekly', sort_order: 10 }),
    ]);
    expect(catalog.subscriptions.map((p) => p.id)).toEqual(['weekly', 'monthly']);
    expect(catalog.topups.map((p) => p.id)).toEqual(['topup_5', 'topup_12']);
  });
});

describe('server balance', () => {
  it('accepts the balance payload', () => {
    const parsed = swipesSchema.parse({
      ok: true,
      balance: 4,
      buckets: { free: 4, plan: 0, topup: 0 },
      plan: null,
      instant: false,
    });
    expect(parsed.ok && parsed.balance).toBe(4);
  });

  it('accepts the not-eligible answer and refuses a negative balance', () => {
    expect(swipesSchema.parse({ ok: false, reason: 'not_eligible' }).ok).toBe(false);
    expect(
      swipesSchema.safeParse({
        ok: true,
        balance: -1,
        buckets: { free: 0, plan: 0, topup: 0 },
        plan: null,
        instant: false,
      }).success,
    ).toBe(false);
  });
});
