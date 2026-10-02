import { useQuery } from '@tanstack/react-query';

import { matchResultSchema, matchesSchema, type Match } from '@/features/matching/model/match';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

export const matchesQueryKey = (userId: string) => ['matches', userId] as const;

/** How often an open app looks for matches made by the other person (until realtime, Phase 9). */
const MATCH_POLL_MS = 60_000;

/** The caller's active matches, newest first. Matches are created only by the server. */
export function useMatches(userId: string | null) {
  return useQuery({
    queryKey: matchesQueryKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    // Paused automatically while the app is in the background.
    refetchInterval: MATCH_POLL_MS,
    queryFn: async (): Promise<Match[]> => {
      const { data, error } = await supabase.rpc('get_my_matches');
      if (error) throw error;
      const parsed = matchesSchema.parse(data);
      return parsed.ok ? parsed.matches : [];
    },
  });
}

/** One match, checked again by the server (used by the reveal and by deep links). */
export function useMatch(matchId: string) {
  return useQuery({
    queryKey: ['match', matchId],
    queryFn: async (): Promise<Match | null> => {
      const { data, error } = await supabase.rpc('get_match', { p_match: matchId });
      if (error) throw error;
      const parsed = matchResultSchema.parse(data);
      return parsed.ok ? parsed.match : null;
    },
  });
}

export function refreshMatches(userId: string) {
  return queryClient.invalidateQueries({ queryKey: matchesQueryKey(userId) });
}

/** Clears the "new" marker for the caller only; the other person has their own. */
export async function markMatchSeen(userId: string, matchId: string) {
  queryClient.setQueryData<Match[]>(matchesQueryKey(userId), (current) =>
    current?.map((match) => (match.id === matchId ? { ...match, seen: true } : match)),
  );
  const { error } = await supabase.rpc('mark_match_seen', { p_match: matchId });
  if (error) throw error;
  await refreshMatches(userId);
}

/** Ends the match for both people. They do not see each other again. */
export async function unmatch(userId: string, matchId: string) {
  const { data, error } = await supabase.rpc('unmatch', { p_match: matchId });
  if (error) throw error;
  if (!(data as { ok: boolean }).ok) throw new Error('unmatch_failed');
  queryClient.setQueryData<Match[]>(matchesQueryKey(userId), (current) =>
    current?.filter((match) => match.id !== matchId),
  );
  await refreshMatches(userId);
}
