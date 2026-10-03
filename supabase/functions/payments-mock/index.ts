import { z } from 'npm:zod@4';

import { requireUser, serviceClient } from '../_shared/auth.ts';
import { HttpError, handler, json } from '../_shared/http.ts';
import { isDevelopment, paymentProvider, webhookSecret } from '../_shared/payments.ts';
import { hmacHex } from '../_shared/razorpay.ts';
import { parseBody } from '../_shared/validate.ts';

// Development only (DECISIONS D-052): plays Razorpay for an order the caller owns. It builds
// the same event Razorpay would send, signs it with the webhook secret and posts it to the
// real payments-webhook, so the whole verified path runs. Refused in production, and the
// database refuses mock orders unless `payments_allow_mock` is on.

const body = z.object({
  order_id: z.uuid(),
  outcome: z.enum(['paid', 'refund', 'expire']),
});

Deno.serve(
  handler(async (req) => {
    if (req.method !== 'POST') throw new HttpError('invalid_request', 'Use POST.');
    if (!isDevelopment() || paymentProvider() !== 'mock') {
      throw new HttpError('forbidden', 'Not available.');
    }
    const { user } = await requireUser(req);
    const { order_id, outcome } = await parseBody(req, body);

    const service = serviceClient();
    const { data: order, error } = await service
      .from('payment_orders')
      .select('id, user_id, provider, provider_link_id, provider_payment_id, amount_paise, status')
      .eq('id', order_id)
      .maybeSingle();
    if (error) throw error;
    if (!order || order.user_id !== user.id || order.provider !== 'mock') {
      throw new HttpError('not_found', 'No such order.');
    }

    let event: Record<string, unknown>;
    if (outcome === 'paid') {
      event = {
        entity: 'event',
        event: 'payment_link.paid',
        contains: ['payment_link', 'payment'],
        payload: {
          payment_link: {
            entity: {
              id: order.provider_link_id,
              status: 'paid',
              amount: order.amount_paise,
              amount_paid: order.amount_paise,
              currency: 'INR',
              reference_id: order.id,
            },
          },
          payment: {
            entity: {
              id: `pay_mock_${crypto.randomUUID()}`,
              amount: order.amount_paise,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };
    } else if (outcome === 'refund') {
      if (!order.provider_payment_id) throw new HttpError('conflict', 'Not paid.');
      event = {
        entity: 'event',
        event: 'refund.processed',
        contains: ['refund', 'payment'],
        payload: {
          refund: {
            entity: {
              id: `rfnd_mock_${crypto.randomUUID()}`,
              payment_id: order.provider_payment_id,
              amount: order.amount_paise,
              currency: 'INR',
              status: 'processed',
            },
          },
        },
      };
    } else {
      event = {
        entity: 'event',
        event: 'payment_link.expired',
        contains: ['payment_link'],
        payload: { payment_link: { entity: { id: order.provider_link_id, status: 'expired' } } },
      };
    }

    const raw = JSON.stringify(event);
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/payments-webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': await hmacHex(webhookSecret(), raw),
        'x-razorpay-event-id': `evt_mock_${crypto.randomUUID()}`,
      },
      body: raw,
    });
    const result = await response.json().catch(() => null);
    return json({ ok: response.ok, result: result?.result ?? null });
  }),
);
