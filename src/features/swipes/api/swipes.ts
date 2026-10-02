import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import {
  planSchema,
  swipesSchema,
  type Plan,
  type SwipeBalance,
} from '@/features/swipes/model/swipes';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

export const swipesQueryKey = (userId: string) => ['swipes', userId] as const;

/** The caller's like balance, plan and Instant entitlement. `null` until the profile is complete. */
export function useSwipeBalance(userId: string | null) {
  return useQuery({
    queryKey: swipesQueryKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    queryFn: async (): Promise<SwipeBalance | null> => {
      const { data, error } = await supabase.rpc('get_my_swipes');
      if (error) throw error;
      const parsed = swipesSchema.parse(data);
      return parsed.ok ? parsed : null;
    },
  });
}

/** The plan catalog. Nothing about prices or quotas is built into the app. */
export function usePlans() {
  return useQuery({
    queryKey: ['plans'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from('plans')
        .select(
          'id, kind, title, price_paise, right_swipes, period_label, includes_instant, sort_order',
        )
        .order('sort_order');
      if (error) throw error;
      return z.array(planSchema).parse(data);
    },
  });
}

/** The balance the server just reported (every like returns it). */
export function setServerBalance(userId: string, balance: number) {
  queryClient.setQueryData<SwipeBalance | null>(swipesQueryKey(userId), (current) =>
    current ? { ...current, balance } : current,
  );
}

/** Shows a like at once; the server's answer replaces it a moment later. */
export function spendOneLocally(userId: string) {
  queryClient.setQueryData<SwipeBalance | null>(swipesQueryKey(userId), (current) =>
    current ? { ...current, balance: Math.max(0, current.balance - 1) } : current,
  );
}

export function refreshSwipes(userId: string) {
  return queryClient.invalidateQueries({ queryKey: swipesQueryKey(userId) });
}
