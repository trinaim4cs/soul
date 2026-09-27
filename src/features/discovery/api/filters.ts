import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import type { DiscoveryFilters } from '@/features/discovery/model/filters';
import { myProfileQueryKey } from '@/features/profile/api/profile';
import { GENDERS, ZODIAC_SIGNS } from '@/features/profile/model/profile';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

const rowSchema = z.object({
  show_me: z.array(z.enum(GENDERS)),
  min_age: z.number().int(),
  max_age: z.number().int(),
  zodiac_filter: z.array(z.enum(ZODIAC_SIGNS)).nullable(),
});

export const filtersQueryKey = (userId: string) => ['discovery-filters', userId] as const;

/** The owner's own preferences row (RLS: owner read only). */
export function useDiscoveryFilters(userId: string | null) {
  return useQuery({
    queryKey: filtersQueryKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    queryFn: async (): Promise<DiscoveryFilters> => {
      const { data, error } = await supabase
        .from('preferences')
        .select('show_me, min_age, max_age, zodiac_filter')
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      const row = rowSchema.parse(data);
      return {
        minAge: row.min_age,
        maxAge: row.max_age,
        showMe: row.show_me,
        zodiac: row.zodiac_filter ?? [],
      };
    },
  });
}

export async function saveFilters(userId: string, filters: DiscoveryFilters) {
  const { error } = await supabase
    .from('preferences')
    .update({
      show_me: filters.showMe,
      min_age: filters.minAge,
      max_age: filters.maxAge,
      zodiac_filter: filters.zodiac.length > 0 ? filters.zodiac : null,
    })
    .eq('user_id', userId);
  if (error) throw error;
  // "Show me" is also on the profile form.
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: filtersQueryKey(userId) }),
    queryClient.invalidateQueries({ queryKey: myProfileQueryKey(userId) }),
  ]);
}
