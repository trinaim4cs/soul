import { z } from 'npm:zod@4';

import { requireUser, serviceClient } from '../_shared/auth.ts';
import { HttpError, handler, json } from '../_shared/http.ts';
import { paymentProvider, razorpayKeys, returnUrl } from '../_shared/payments.ts';
import { createPaymentLink } from '../_shared/razorpay.ts';
import { parseBody } from '../_shared/validate.ts';

// Starts a purchase (DECISIONS D-037, D-052). The app names a catalog item; the server
// freezes its price in an order and asks the provider for a checkout link. Nothing is
// granted here: only a verified payment does that, in payments-webhook.

const body = z.object({
  plan: z.string().min(1).max(40),
  platform: z.enum(['android', 'web']),
});

Deno.serve(
  handler(async (req) => {
    if (req.method !== 'POST') throw new HttpError('invalid_request', 'Use POST.');
    const { user } = await requireUser(req);
    const { plan, platform } = await parseBody(req, body);

    const provider = paymentProvider();
    if (provider === 'none') return json({ ok: false, reason: 'not_configured' });

    const service = serviceClient();
    const created = await service.rpc('payment_create_order', {
      p_user: user.id,
      p_plan: plan,
      p_provider: provider,
    });
    if (created.error) throw created.error;
    if (!created.data?.ok) return json({ ok: false, reason: created.data?.reason ?? 'invalid' });
    const order = created.data.order as {
      id: string;
      amount_paise: number;
      expires_at: string;
      description: string;
    };

    if (provider === 'mock') {
      const attached = await service.rpc('payment_attach_link', {
        p_order: order.id,
        p_link_id: `plink_mock_${crypto.randomUUID()}`,
        p_url: null,
      });
      if (attached.error) throw attached.error;
      return json({ ok: true, provider, order_id: order.id });
    }

    const link = await createPaymentLink(razorpayKeys()!, {
      orderId: order.id,
      amountPaise: order.amount_paise,
      description: order.description,
      callbackUrl: returnUrl(order.id, platform),
      expiresAt: new Date(order.expires_at),
      planId: plan,
    });
    const attached = await service.rpc('payment_attach_link', {
      p_order: order.id,
      p_link_id: link.id,
      p_url: link.short_url,
    });
    if (attached.error) throw attached.error;
    return json({ ok: true, provider, order_id: order.id, url: link.short_url });
  }),
);
