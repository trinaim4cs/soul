// Razorpay Payment Links and webhooks (DECISIONS D-037, D-052). Runs in Deno (Edge
// Functions) and in Node (unit tests): only fetch and WebCrypto are used.

const API = 'https://api.razorpay.com/v1';
const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 of `message` with `secret`, as lowercase hex (Razorpay's signature format). */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/** Compares two strings in time that does not depend on where they differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Checks `X-Razorpay-Signature` against the raw request body. The body must be the exact
 * bytes received: parsing and re-serialising it would change the signature.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;
  const expected = await hmacHex(secret, rawBody);
  return constantTimeEqual(expected, signature.trim().toLowerCase());
}

export type RazorpayKeys = { keyId: string; keySecret: string };

function authorization(keys: RazorpayKeys): string {
  return `Basic ${btoa(`${keys.keyId}:${keys.keySecret}`)}`;
}

export type PaymentLinkRequest = {
  orderId: string;
  amountPaise: number;
  description: string;
  callbackUrl: string;
  expiresAt: Date;
  planId: string;
};

export type PaymentLink = { id: string; short_url: string; status: string };

/** Creates a Standard Payment Link for one SOUL order. */
export async function createPaymentLink(
  keys: RazorpayKeys,
  request: PaymentLinkRequest,
  fetcher: typeof fetch = fetch,
): Promise<PaymentLink> {
  const response = await fetcher(`${API}/payment_links`, {
    method: 'POST',
    headers: { authorization: authorization(keys), 'content-type': 'application/json' },
    body: JSON.stringify({
      amount: request.amountPaise,
      currency: 'INR',
      accept_partial: false,
      description: request.description,
      // Our order id: how the webhook finds the order (40 characters at most; a UUID is 36).
      reference_id: request.orderId,
      expire_by: Math.floor(request.expiresAt.getTime() / 1000),
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { soul_order: request.orderId, plan: request.planId },
      callback_url: request.callbackUrl,
      callback_method: 'get',
    }),
  });
  if (!response.ok) throw new Error(`razorpay_create_${response.status}`);
  const link = (await response.json()) as PaymentLink;
  if (!link.id || !link.short_url) throw new Error('razorpay_create_shape');
  return link;
}

export type PaymentLinkStatus = {
  id: string;
  status: string;
  amount: number;
  amount_paid: number;
  currency: string;
  reference_id: string;
  payments: { payment_id: string; amount: number; status: string }[] | null;
};

/** Reads a link's current state straight from Razorpay (for webhooks that never arrived). */
export async function fetchPaymentLink(
  keys: RazorpayKeys,
  linkId: string,
  fetcher: typeof fetch = fetch,
): Promise<PaymentLinkStatus> {
  const response = await fetcher(`${API}/payment_links/${encodeURIComponent(linkId)}`, {
    headers: { authorization: authorization(keys) },
  });
  if (!response.ok) throw new Error(`razorpay_fetch_${response.status}`);
  return (await response.json()) as PaymentLinkStatus;
}

/** What SOUL needs from a webhook, whatever its type. Everything else is ignored. */
export type WebhookAction =
  | {
      kind: 'paid';
      orderId: string;
      linkId: string;
      paymentId: string;
      amount: number;
      currency: string;
    }
  | { kind: 'refunded'; paymentId: string; refundId: string; amount: number }
  | { kind: 'closed'; linkId: string; status: 'expired' | 'cancelled' }
  | { kind: 'ignored'; type: string };

type Entity = Record<string, unknown>;
const entity = (payload: Entity, name: string): Entity | null => {
  const holder = payload[name] as { entity?: Entity } | undefined;
  return holder?.entity ?? null;
};
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const number = (value: unknown) => (typeof value === 'number' ? value : NaN);

/** Turns a parsed webhook body into the one action SOUL takes for it. */
export function webhookAction(body: unknown): WebhookAction {
  const event = (body ?? {}) as { event?: unknown; payload?: Entity };
  const type = text(event.event);
  const payload = event.payload ?? {};

  if (type === 'payment_link.paid') {
    const link = entity(payload, 'payment_link');
    const payment = entity(payload, 'payment');
    if (link && payment) {
      return {
        kind: 'paid',
        orderId: text(link.reference_id),
        linkId: text(link.id),
        paymentId: text(payment.id),
        amount: number(payment.amount),
        currency: text(payment.currency),
      };
    }
  }
  if (type === 'refund.processed') {
    const refund = entity(payload, 'refund');
    if (refund) {
      return {
        kind: 'refunded',
        paymentId: text(refund.payment_id),
        refundId: text(refund.id),
        amount: number(refund.amount),
      };
    }
  }
  if (type === 'payment_link.expired' || type === 'payment_link.cancelled') {
    const link = entity(payload, 'payment_link');
    if (link) {
      return {
        kind: 'closed',
        linkId: text(link.id),
        status: type === 'payment_link.expired' ? 'expired' : 'cancelled',
      };
    }
  }
  return { kind: 'ignored', type: type || 'unknown' };
}
