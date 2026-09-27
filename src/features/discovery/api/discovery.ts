import { randomUUID } from 'expo-crypto';

import { cardSchema, feedSchema, type DiscoveryCard } from '@/features/discovery/model/card';
import { supabase } from '@/lib/supabase';

export const FEED_PAGE_SIZE = 20;

export type FeedResult =
  { ok: true; cards: DiscoveryCard[] } | { ok: false; reason: 'not_eligible' | 'unknown' };

/** The next candidates, excluding cards already on screen or just decided. */
export async function fetchFeed(exclude: string[]): Promise<FeedResult> {
  const { data, error } = await supabase.rpc('discovery_feed', {
    p_exclude: exclude,
    p_limit: FEED_PAGE_SIZE,
  });
  if (error) throw error;
  const parsed = feedSchema.parse(data);
  if (parsed.ok) return parsed;
  return { ok: false, reason: parsed.reason === 'not_eligible' ? 'not_eligible' : 'unknown' };
}

export async function fetchProfileCard(target: string): Promise<DiscoveryCard | null> {
  const { data, error } = await supabase.rpc('get_profile_card', { p_target: target });
  if (error) throw error;
  const result = data as { ok: boolean; card?: unknown };
  return result.ok ? cardSchema.parse(result.card) : null;
}

export type SwipeResult = { ok: true } | { ok: false; reason: 'not_available' | 'invalid' };

/**
 * A like carries an idempotency key, so a retry after a dropped connection never counts twice
 * (Phase 7 charges swipe credits inside the same server transaction).
 */
export async function swipeRight(
  target: string,
  idempotencyKey = randomUUID(),
): Promise<SwipeResult> {
  const { data, error } = await supabase.rpc('swipe_right', {
    p_target: target,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return data as SwipeResult;
}

export async function swipeLeft(target: string): Promise<SwipeResult> {
  const { data, error } = await supabase.rpc('swipe_left', { p_target: target });
  if (error) throw error;
  return data as SwipeResult;
}
