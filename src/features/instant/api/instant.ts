import { useQuery } from '@tanstack/react-query';

import {
  candidatesSchema,
  resultSchema,
  stateSchema,
  type InstantCandidate,
  type InstantDuration,
  type InstantState,
} from '@/features/instant/model/instant';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { LocationFix } from '@/services/location';

export const instantStateKey = (userId: string) => ['instant', 'state', userId] as const;
export const instantCandidatesKey = (userId: string) => ['instant', 'candidates', userId] as const;

/** During a session the rounded distance and bearing are re-read this often. */
const SESSION_POLL_MS = 5_000;
/** While searching, new people nearby are looked for this often. */
const SEARCH_POLL_MS = 8_000;

/**
 * Everything the Instant tab shows (DECISIONS D-050). The server decides entitlement, whether
 * Instant is on, and the session; the account topic nudges a re-read when a session starts or
 * ends, and polling keeps the distance current. Paused while the app is in the background.
 */
export function useInstantState(userId: string | null) {
  return useQuery({
    queryKey: instantStateKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    staleTime: 0,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (state?.session) return SESSION_POLL_MS;
      return state?.active ? SEARCH_POLL_MS : false;
    },
    queryFn: async (): Promise<InstantState | null> => {
      const { data, error } = await supabase.rpc('instant_state');
      if (error) throw error;
      const parsed = stateSchema.parse(data);
      return parsed.ok ? parsed : null;
    },
  });
}

/** People nearby who could meet now. No distance, no direction, no order by closeness. */
export function useInstantCandidates(userId: string | null, searching: boolean) {
  return useQuery({
    queryKey: instantCandidatesKey(userId ?? 'signed-out'),
    enabled: userId !== null && searching,
    staleTime: 0,
    refetchInterval: searching ? SEARCH_POLL_MS : false,
    queryFn: async (): Promise<InstantCandidate[]> => {
      const { data, error } = await supabase.rpc('instant_candidates');
      if (error) throw error;
      return candidatesSchema.parse(data).candidates;
    },
  });
}

/** Re-reads the state and the candidates (after an action, or a nudge from the server). */
export function refreshInstant(userId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: instantStateKey(userId) }),
    queryClient.invalidateQueries({ queryKey: instantCandidatesKey(userId) }),
  ]);
}

export type InstantOutcome = { ok: true; session: string | null } | { ok: false; reason: string };

async function outcome(
  request: PromiseLike<{ data: unknown; error: Error | null }>,
): Promise<InstantOutcome> {
  const { data, error } = await request;
  if (error) throw error;
  const result = resultSchema.parse(data);
  return result.ok
    ? { ok: true, session: result.session ?? null }
    : { ok: false, reason: result.reason ?? 'unknown' };
}

export const startInstant = (minutes: InstantDuration) =>
  outcome(supabase.rpc('instant_start', { p_minutes: minutes }));
export const stopInstant = () => outcome(supabase.rpc('instant_stop'));
export const acceptCandidate = (id: string) =>
  outcome(supabase.rpc('instant_accept', { p_candidate: id }));
export const skipCandidate = (id: string) =>
  outcome(supabase.rpc('instant_skip', { p_candidate: id }));
export const endSession = () => outcome(supabase.rpc('instant_end_session'));

/** The device's own position, to the server only. Refusals (too soon, a jump) are ignored. */
export async function sendFix(fix: LocationFix): Promise<void> {
  const { error } = await supabase.rpc('instant_update_location', {
    p_latitude: fix.latitude,
    p_longitude: fix.longitude,
    p_accuracy: fix.accuracy,
  });
  if (error) throw error;
}
