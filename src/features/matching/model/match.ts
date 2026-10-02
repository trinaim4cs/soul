import { z } from 'zod';

import { cardSchema, type DiscoveryCard } from '@/features/discovery/model/card';

/** A match as `get_my_matches` / `get_match` return it: the other person as a whitelisted card. */
export const matchSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string(),
  seen: z.boolean(),
  person: cardSchema,
  conversation_id: z.string().uuid().nullable(),
  /** The newest message of the conversation, already shortened by the server. */
  last_message: z
    .object({ id: z.number().int(), body: z.string(), mine: z.boolean(), created_at: z.string() })
    .nullable(),
  /** Messages from the other person the caller has not read. */
  unread: z.number().int().nonnegative(),
});
export type Match = z.infer<typeof matchSchema>;

export const matchesSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), matches: z.array(matchSchema) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export const matchResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), match: matchSchema }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

/** The match a like just made (or one not yet seen), as `swipe_right` reports it. */
export const announcedMatchSchema = z.object({ id: z.string().uuid(), person: cardSchema });
export type AnnouncedMatch = z.infer<typeof announcedMatchSchema>;

/** What the Chats tab counts: new matches and conversations with unread messages. */
export function unseenCount(matches: Match[] | undefined): number {
  return (matches ?? []).filter((match) => !match.seen || match.unread > 0).length;
}

/** A person's first name, or a neutral word when they stay anonymous after matching. */
export function personName(person: DiscoveryCard): string {
  return person.anonymous || !person.name ? 'Anonymous' : person.name;
}

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Matched today", "Matched yesterday", "Matched 3 days ago", then the date. */
export function matchedLabel(createdAt: string, now: Date = new Date()): string {
  const created = new Date(createdAt);
  const days = Math.round((startOfDay(now) - startOfDay(created)) / DAY);
  if (days <= 0) return 'Matched today';
  if (days === 1) return 'Matched yesterday';
  if (days < 7) return `Matched ${days} days ago`;
  return `Matched ${created.getDate()} ${MONTHS[created.getMonth()]}`;
}
