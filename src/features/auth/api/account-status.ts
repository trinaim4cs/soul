import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { supabase } from '@/lib/supabase';

/** Shape of `public.get_my_status()` (supabase/migrations/..._srmist_auth.sql). */
export const serverStatusSchema = z.object({
  account_state: z.enum(['active', 'suspended', 'banned', 'deletion_pending']),
  eligibility: z.enum(['incomplete', 'eligible']),
  steps: z.object({
    email: z.boolean(),
    terms: z.boolean(),
    age: z.boolean(),
    profile: z.boolean(),
  }),
  age_locked: z.boolean(),
  current_terms_version: z.string().nullable(),
  /** Suspended accounts: until when (null for an open-ended suspension or a ban). */
  restricted_until: z.string().nullable().default(null),
  restriction_reason: z.string().nullable().default(null),
});

export type ServerStatus = z.infer<typeof serverStatusSchema>;

export const accountStatusQueryKey = (userId: string) => ['account-status', userId] as const;

async function fetchServerStatus(): Promise<ServerStatus> {
  const { data, error } = await supabase.rpc('get_my_status');
  if (error) throw error;
  return serverStatusSchema.parse(data);
}

/** Server-computed account status for the signed-in user (disabled when signed out). */
export function useServerStatus(userId: string | null) {
  return useQuery({
    queryKey: accountStatusQueryKey(userId ?? 'signed-out'),
    queryFn: fetchServerStatus,
    enabled: userId !== null,
    staleTime: 60_000,
    // The splash waits for this answer, so it must not pause while offline (Phase 19): it
    // fails instead, and the app says it can't reach SOUL, with a retry.
    networkMode: 'always',
    // A suspended or banned account waits on a moderator: the account topic nudges at once,
    // and this slow re-check catches a nudge that was lost (Realtime is best-effort).
    refetchInterval: (query) =>
      query.state.data && query.state.data.account_state !== 'active' ? 30_000 : false,
  });
}
