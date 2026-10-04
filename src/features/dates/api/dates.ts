import { useQuery } from '@tanstack/react-query';

import {
  answerSchema,
  dateStateSchema,
  myDatesSchema,
  type DateState,
  type MyDates,
} from '@/features/dates/model/dates';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

/** While waiting for the other person's answer, how often to check again. */
const WAITING_POLL_MS = 15_000;

export const dateStateKey = (otherId: string) => ['dates', 'state', otherId] as const;
export const myDatesKey = (userId: string) => ['dates', 'mine', userId] as const;

/** "Did you meet?" for one person; `null` when the two cannot confirm a date. */
export function useDateState(otherId: string | null) {
  return useQuery({
    queryKey: dateStateKey(otherId ?? 'none'),
    enabled: otherId !== null,
    staleTime: 0,
    // The server nudges the account topic when the other person answers; while waiting on
    // them, a slow re-check also catches a nudge that was missed (a dropped socket).
    refetchInterval: (query) => (query.state.data?.state === 'waiting' ? WAITING_POLL_MS : false),
    queryFn: async (): Promise<DateState | null> => {
      const { data, error } = await supabase.rpc('date_state', { p_other: otherId! });
      if (error) throw error;
      const parsed = dateStateSchema.parse(data);
      return parsed.ok ? parsed : null;
    },
  });
}

/** The owner's private progress toward the fire badge. */
export function useMyDates(userId: string | null) {
  return useQuery({
    queryKey: myDatesKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    queryFn: async (): Promise<MyDates | null> => {
      const { data, error } = await supabase.rpc('get_my_dates');
      if (error) throw error;
      const parsed = myDatesSchema.parse(data);
      return parsed.ok ? parsed : null;
    },
  });
}

export type AnswerOutcome =
  | { ok: true; state: 'ask' | 'waiting' | 'confirmed' }
  | { ok: false; reason: 'cooldown' | 'already_answered' | 'not_available' | 'invalid' };

/** Records "Yes, we met" or "Not yet". The server decides what it means; answers are final. */
export async function answerDate(otherId: string, met: boolean): Promise<AnswerOutcome> {
  const { data, error } = await supabase.rpc('answer_date', { p_other: otherId, p_met: met });
  if (error) throw error;
  const result = answerSchema.parse(data);
  if (result.ok) return { ok: true, state: result.state ?? 'ask' };
  const reason = result.reason;
  return {
    ok: false,
    reason:
      reason === 'cooldown' || reason === 'already_answered' || reason === 'not_available'
        ? reason
        : 'invalid',
  };
}

/** Re-reads every date state and the owner's progress (after an answer or a server nudge). */
export function refreshDates() {
  return queryClient.invalidateQueries({ queryKey: ['dates'] });
}
