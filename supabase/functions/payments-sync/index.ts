import { z } from 'npm:zod@4';

import { requireUser, serviceClient } from '../_shared/auth.ts';
import { HttpError, handler, json } from '../_shared/http.ts';
import { paymentProvider, razorpayKeys } from '../_shared/payments.ts';
import { fetchPaymentLink } from '../_shared/razorpay.ts';
import { parseBody } from '../_shared/validate.ts';

// Entitlement synchronization and "restore" (spec 66, DECISIONS D-052). If a webhook was
// delayed or lost, this asks Razorpay directly about the caller's unpaid orders and applies
// the same idempotent rules. It can only ever grant what Razorpay itself reports as paid.

const body = z.object({ order_id: z.uuid().optional() });

type Order = {
  id: string;
  provider: string;
  provider_link_id: string | null;
  amount_paise: number;
  status: string;
};

Deno.serve(
  handler(async (req) => {
    if (req.method !== 'POST') throw new HttpError('invalid_request', 'Use POST.');
    const { user } = await requireUser(req);
    const { order_id } = await parseBody(req, body);
    const service = serviceClient();

    let query = service
      .from('payment_orders')
      .select('id, provider, provider_link_id, amount_paise, status')
      .eq('user_id', user.id)
      .eq('status', 'created')
      .order('created_at', { ascending: false })
      .limit(10);
    if (order_id) query = query.eq('id', order_id);
    const { data, error } = await query;
    if (error) throw error;

    const keys = razorpayKeys();
    const checked: { id: string; status: string }[] = [];
    for (const order of (data ?? []) as Order[]) {
      if (order.provider !== 'razorpay' || !order.provider_link_id || !keys) {
        checked.push({ id: order.id, status: order.status });
        continue;
      }
      const link = await fetchPaymentLink(keys, order.provider_link_id);
      if (link.status === 'paid') {
        const payment = (link.payments ?? []).find(
          (item) => item.status === 'captured' && item.amount === order.amount_paise,
        );
        if (payment) {
          const paid = await service.rpc('payment_mark_paid', {
            p_order: order.id,
            p_link_id: link.id,
            p_payment_id: payment.payment_id,
            p_amount: payment.amount,
            p_currency: link.currency,
          });
          if (paid.error) throw paid.error;
          checked.push({ id: order.id, status: paid.data?.ok ? 'paid' : 'created' });
          continue;
        }
      }
      if (link.status === 'expired' || link.status === 'cancelled') {
        await service.rpc('payment_mark_closed', {
          p_link_id: link.id,
          p_status: link.status,
        });
        checked.push({ id: order.id, status: link.status });
        continue;
      }
      checked.push({ id: order.id, status: order.status });
    }
    return json({ ok: true, provider: paymentProvider(), orders: checked });
  }),
);
