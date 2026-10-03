import {
  constantTimeEqual,
  createPaymentLink,
  hmacHex,
  verifyWebhookSignature,
  webhookAction,
} from './razorpay';

const secret = 'test-webhook-secret';

const paid = {
  entity: 'event',
  event: 'payment_link.paid',
  contains: ['payment_link', 'order', 'payment'],
  payload: {
    payment_link: {
      entity: {
        id: 'plink_TEST01',
        status: 'paid',
        amount: 19900,
        amount_paid: 19900,
        currency: 'INR',
        reference_id: '00000000-0000-4000-8000-000000000001',
      },
    },
    payment: {
      entity: { id: 'pay_TEST01', amount: 19900, currency: 'INR', status: 'captured' },
    },
  },
};

describe('webhook signatures', () => {
  it('computes HMAC-SHA256 as hex', async () => {
    // Known answer for HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog").
    expect(await hmacHex('key', 'The quick brown fox jumps over the lazy dog')).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
  });

  it('accepts the exact body signed with the secret', async () => {
    const body = JSON.stringify(paid);
    const signature = await hmacHex(secret, body);
    expect(await verifyWebhookSignature(body, signature, secret)).toBe(true);
  });

  it('refuses a changed body, a wrong secret, or no signature', async () => {
    const body = JSON.stringify(paid);
    const signature = await hmacHex(secret, body);
    const tampered = body.replace('19900', '100');
    expect(await verifyWebhookSignature(tampered, signature, secret)).toBe(false);
    expect(await verifyWebhookSignature(body, signature, 'another-secret')).toBe(false);
    expect(await verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(await verifyWebhookSignature(body, signature, '')).toBe(false);
  });

  it('compares without shortcuts', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('webhook actions', () => {
  it('reads a paid link: our order, the payment, the amount', () => {
    expect(webhookAction(paid)).toEqual({
      kind: 'paid',
      orderId: '00000000-0000-4000-8000-000000000001',
      linkId: 'plink_TEST01',
      paymentId: 'pay_TEST01',
      amount: 19900,
      currency: 'INR',
    });
  });

  it('reads a processed refund', () => {
    expect(
      webhookAction({
        event: 'refund.processed',
        payload: {
          refund: { entity: { id: 'rfnd_TEST01', payment_id: 'pay_TEST01', amount: 19900 } },
        },
      }),
    ).toEqual({
      kind: 'refunded',
      paymentId: 'pay_TEST01',
      refundId: 'rfnd_TEST01',
      amount: 19900,
    });
  });

  it('reads expired and cancelled links', () => {
    const closed = (event: string) =>
      webhookAction({ event, payload: { payment_link: { entity: { id: 'plink_TEST01' } } } });
    expect(closed('payment_link.expired')).toEqual({
      kind: 'closed',
      linkId: 'plink_TEST01',
      status: 'expired',
    });
    expect(closed('payment_link.cancelled')).toEqual({
      kind: 'closed',
      linkId: 'plink_TEST01',
      status: 'cancelled',
    });
  });

  it('ignores anything else, and malformed bodies', () => {
    expect(webhookAction({ event: 'payment.authorized', payload: {} })).toEqual({
      kind: 'ignored',
      type: 'payment.authorized',
    });
    expect(webhookAction(null)).toEqual({ kind: 'ignored', type: 'unknown' });
    expect(webhookAction({ event: 'payment_link.paid', payload: {} }).kind).toBe('ignored');
  });
});

describe('creating a payment link', () => {
  it('sends the order, the frozen amount and no customer details', async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fetcher = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(
        JSON.stringify({ id: 'plink_TEST02', short_url: 'https://rzp.io/test', status: 'created' }),
      );
    }) as unknown as typeof fetch;
    const link = await createPaymentLink(
      { keyId: 'rzp_test_key', keySecret: 'secret' },
      {
        orderId: '00000000-0000-4000-8000-000000000002',
        amountPaise: 24900,
        description: 'SOUL · 3 months',
        callbackUrl: 'https://example.test/pay/return?order=00000000-0000-4000-8000-000000000002',
        expiresAt: new Date('2026-10-03T10:20:00Z'),
        planId: 'quarter',
      },
      fetcher,
    );
    expect(link.short_url).toBe('https://rzp.io/test');
    expect(sent!.url).toBe('https://api.razorpay.com/v1/payment_links');
    const body = JSON.parse(String(sent!.init.body));
    expect(body).toMatchObject({
      amount: 24900,
      currency: 'INR',
      accept_partial: false,
      reference_id: '00000000-0000-4000-8000-000000000002',
      expire_by: Math.floor(Date.parse('2026-10-03T10:20:00Z') / 1000),
      callback_method: 'get',
      notify: { sms: false, email: false },
    });
    expect(body).not.toHaveProperty('customer');
    expect((sent!.init.headers as Record<string, string>).authorization).toBe(
      `Basic ${btoa('rzp_test_key:secret')}`,
    );
  });

  it('fails loudly when Razorpay refuses', async () => {
    const fetcher = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    await expect(
      createPaymentLink(
        { keyId: 'k', keySecret: 's' },
        {
          orderId: 'x',
          amountPaise: 100,
          description: 'd',
          callbackUrl: 'https://example.test',
          expiresAt: new Date(),
          planId: 'weekly',
        },
        fetcher,
      ),
    ).rejects.toThrow('razorpay_create_401');
  });
});
