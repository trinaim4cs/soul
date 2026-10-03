import { serviceClient } from '../_shared/auth.ts';
import { HttpError, handler, json } from '../_shared/http.ts';
import { UUID, webhookSecret } from '../_shared/payments.ts';
import { hmacHex, verifyWebhookSignature, webhookAction } from '../_shared/razorpay.ts';

// Razorpay webhooks (DECISIONS D-037, D-052): the only way a payment grants anything.
// The signature is checked against the raw body before anything is parsed. Every action is
// idempotent, so retries and duplicate deliveries are harmless; an event is recorded only
// after it was handled, so a failure here makes Razorpay retry it.

const MAX_BODY = 200_000;

Deno.serve(
  handler(async (req) => {
    if (req.method !== 'POST') throw new HttpError('invalid_request', 'Use POST.');
    const raw = await req.text();
    if (raw.length > MAX_BODY) throw new HttpError('invalid_request', 'Too large.');

    const signature = req.headers.get('x-razorpay-signature');
    if (!(await verifyWebhookSignature(raw, signature, webhookSecret()))) {
      throw new HttpError('unauthorized', 'Bad signature.');
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError('invalid_request', 'Expected JSON.');
    }
    const action = webhookAction(body);
    const eventId =
      req.headers.get('x-razorpay-event-id') ?? `body:${await hmacHex('event-id', raw)}`;
    const service = serviceClient();

    let result = 'ignored';
    let orderId: string | null = null;
    if (action.kind === 'paid') {
      if (!UUID.test(action.orderId)) {
        result = 'unknown_reference';
      } else {
        orderId = action.orderId;
        const paid = await service.rpc('payment_mark_paid', {
          p_order: action.orderId,
          p_link_id: action.linkId,
          p_payment_id: action.paymentId,
          p_amount: action.amount,
          p_currency: action.currency,
        });
        if (paid.error) throw paid.error;
        result = paid.data?.ok ? 'granted' : `refused:${paid.data?.reason ?? 'unknown'}`;
      }
    } else if (action.kind === 'refunded') {
      const refunded = await service.rpc('payment_mark_refunded', {
        p_payment_id: action.paymentId,
        p_refund_id: action.refundId,
        p_amount: action.amount,
      });
      if (refunded.error) throw refunded.error;
      result = refunded.data?.revoked ? 'revoked' : `refund:${refunded.data?.reason ?? 'partial'}`;
    } else if (action.kind === 'closed') {
      const closed = await service.rpc('payment_mark_closed', {
        p_link_id: action.linkId,
        p_status: action.status,
      });
      if (closed.error) throw closed.error;
      result = action.status;
    }

    // Ids and amounts only: never the payer's email, phone or card details.
    const summary =
      action.kind === 'paid'
        ? { link: action.linkId, payment: action.paymentId, amount: action.amount }
        : action.kind === 'refunded'
          ? { payment: action.paymentId, refund: action.refundId, amount: action.amount }
          : action.kind === 'closed'
            ? { link: action.linkId }
            : { type: action.type };
    const recorded = await service.rpc('payment_record_event', {
      p_event_id: eventId,
      p_provider: 'razorpay',
      p_type: action.kind === 'ignored' ? action.type : action.kind,
      p_order: orderId,
      p_summary: summary,
    });
    if (recorded.error) throw recorded.error;
    await service.rpc('payment_set_event_result', { p_event_id: eventId, p_result: result });
    return json({ ok: true, result });
  }),
);
