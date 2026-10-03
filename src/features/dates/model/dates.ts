import { z } from 'zod';

import { cardSchema } from '@/features/discovery/model/card';

/**
 * What the caller sees for one person (`date_state`, DECISIONS D-051). Never the other
 * person's answer while the caller has not answered: a pending yes from them looks like `ask`.
 */
export const dateStateSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    person: cardSchema,
    source: z.enum(['match', 'instant']),
    /** `ask`: Did you meet? · `waiting`: the caller said yes · `confirmed`: both did, recently. */
    state: z.enum(['ask', 'waiting', 'confirmed']),
    /** While waiting: the last moment the other person's yes still counts. */
    closes_at: z.string().nullable(),
    /** After a confirmed date: when another date with the same person could count. */
    next_at: z.string().nullable(),
    /** How the caller's last yes of the past week ended. */
    last: z
      .object({ outcome: z.enum(['confirmed', 'not_counted', 'expired']), at: z.string() })
      .nullable(),
  }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type DateState = Extract<z.infer<typeof dateStateSchema>, { ok: true }>;

export const answerSchema = z.object({
  ok: z.boolean(),
  state: z.enum(['ask', 'waiting', 'confirmed']).optional(),
  reason: z.string().optional(),
});

/** The owner's private progress (`get_my_dates`): the count is never shown to anyone else. */
export const myDatesSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    active: z.boolean(),
    count: z.number().int().nonnegative(),
    threshold: z.number().int().positive(),
    window_days: z.number().int().positive(),
    distinct_partners: z.boolean(),
    /** When the oldest counted date leaves the window; null with no counted dates. */
    next_change: z.string().nullable(),
  }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type MyDates = Extract<z.infer<typeof myDatesSchema>, { ok: true }>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "7 Oct" in the device's own time zone. */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "2 of 3 dates in the last 30 days", then "4 dates in the last 30 days" once there. */
export function progressLabel(dates: Pick<MyDates, 'count' | 'threshold' | 'window_days'>) {
  const days = `in the last ${dates.window_days} days`;
  if (dates.count >= dates.threshold) return `${dates.count} dates ${days}`;
  return `${dates.count} of ${dates.threshold} dates ${days}`;
}

/** The explanation under the private progress line. Never names the badge "Hot Person". */
export function progressDetail(dates: MyDates): string {
  if (dates.active) {
    return `Your profile shows the fire badge. It stays while you keep ${dates.threshold} dates in any ${dates.window_days} days. Only you see this count.`;
  }
  const people = dates.distinct_partners ? ' with different people' : '';
  return `A date counts when you both confirm you met. ${dates.threshold} dates${people} within ${dates.window_days} days put the fire badge on your profile. Only you see this count.`;
}

/** A short note on how the caller's last yes ended, if it did not simply count. */
export function lastNote(state: DateState): string | null {
  if (!state.last || state.state !== 'ask') return null;
  if (state.last.outcome === 'not_counted')
    return 'Your last yes did not count: it takes a yes from both of you.';
  if (state.last.outcome === 'expired') return 'Your last yes ran out before it was confirmed.';
  return null;
}
