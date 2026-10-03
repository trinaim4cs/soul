import { z } from 'zod';

import { formatPrice } from '@/features/swipes/model/swipes';

/** One order as the owner sees it (`get_payment`, `get_my_payments`, DECISIONS D-052). */
export const paymentSchema = z.object({
  id: z.string().uuid(),
  plan_id: z.string(),
  title: z.string().nullable(),
  amount_paise: z.number().int().positive(),
  status: z.enum(['created', 'paid', 'expired', 'cancelled', 'refunded', 'rejected']),
  created_at: z.string(),
  paid_at: z.string().nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const paymentResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), payment: paymentSchema }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export const paymentsSchema = z.object({ ok: z.literal(true), payments: z.array(paymentSchema) });

/** How the payment reads in a list: "Paid", "Refunded", "Not completed"… */
export function paymentStatusLabel(status: Payment['status']): string {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'refunded':
      return 'Refunded';
    case 'created':
      return 'Waiting for payment';
    case 'rejected':
      return 'Not accepted';
    default:
      return 'Not completed';
  }
}

/** "Monthly · ₹199". */
export function paymentLine(payment: Payment): string {
  return `${payment.title ?? payment.plan_id} · ${formatPrice(payment.amount_paise)}`;
}

/** Why checkout could not start, in the app's words. Nothing was ever charged. */
export function unavailableMessage(reason: string): string {
  switch (reason) {
    case 'not_configured':
    case 'closed':
      return "Payments aren't open yet. Nothing was charged.";
    case 'too_many_open':
      return 'You have a few unfinished payments. Finish one, or try again in 20 minutes.';
    case 'not_eligible':
      return 'Finish your profile first, then come back.';
    default:
      return "That payment couldn't start. Nothing was charged.";
  }
}
