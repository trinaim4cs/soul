import { useQuery } from '@tanstack/react-query';

import {
  blocksSchema,
  resultSchema,
  type BlockedPerson,
  type ReportCategory,
  type SafetyContext,
} from '@/features/safety/model/safety';
import { forgetSignedUrls } from '@/features/profile/api/signed-urls';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { stripInvisible } from '@/lib/text';

export const blocksKey = (userId: string) => ['safety', 'blocks', userId] as const;

/** Blocks someone (spec 42). Ends everything between the two at once; they are not told. */
export async function blockUser(targetId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('block_user', { p_target: targetId });
  if (error) throw error;
  return resultSchema.parse(data).ok;
}

export async function unblockUser(targetId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', { p_target: targetId });
  if (error) throw error;
}

export type ReportOutcome = { ok: true; blocked: boolean } | { ok: false; reason: string };

export async function reportUser(input: {
  targetId: string;
  category: ReportCategory;
  details: string;
  context: SafetyContext;
  block: boolean;
}): Promise<ReportOutcome> {
  const { data, error } = await supabase.rpc('report_user', {
    p_target: input.targetId,
    p_category: input.category,
    p_details: stripInvisible(input.details).trim(),
    p_context: input.context,
    p_block: input.block,
  });
  if (error) throw error;
  const result = resultSchema.parse(data);
  return result.ok
    ? { ok: true, blocked: result.blocked ?? false }
    : { ok: false, reason: result.reason ?? 'invalid' };
}

export function useMyBlocks(userId: string | null) {
  return useQuery({
    queryKey: blocksKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    queryFn: async (): Promise<BlockedPerson[]> => {
      const { data, error } = await supabase.rpc('get_my_blocks');
      if (error) throw error;
      return blocksSchema.parse(data).blocks;
    },
  });
}

/** After a block, every list that could show the person re-reads. */
export function refreshAfterBlock() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['matches'] }),
    queryClient.invalidateQueries({ queryKey: ['instant'] }),
    queryClient.invalidateQueries({ queryKey: ['dates'] }),
    queryClient.invalidateQueries({ queryKey: ['safety'] }),
  ]);
}

/** Deletes the account for good (the server does all of it), then signs out on this device. */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('account-delete', {
    body: { confirm: 'DELETE' },
  });
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
  forgetSignedUrls();
  queryClient.clear();
}
