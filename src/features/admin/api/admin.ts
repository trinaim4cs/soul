import { useQuery } from '@tanstack/react-query';

import {
  accountSchema,
  appealSchema,
  flagsSchema,
  plansSchema,
  queueSchema,
  resultSchema,
  roleSchema,
  type AdminRole,
} from '@/features/admin/model/admin';
import type { ReportCategory } from '@/features/safety/model/safety';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

export const roleKey = (userId: string) => ['admin', 'role', userId] as const;
export const queueKey = ['admin', 'queue'] as const;
export const accountKey = (id: string) => ['admin', 'account', id] as const;
export const plansKey = ['admin', 'plans'] as const;
export const flagsKey = ['admin', 'flags'] as const;
export const appealKey = (userId: string) => ['appeal', userId] as const;

type Result = { ok: boolean; reason?: string };

/** The generated types mark SQL arguments as non-null, but these functions accept null. */
const orNull = (value: string | null) => value as string;

/** Every admin function refuses callers without the role (42501); that error is thrown. */
function result({ data, error }: { data: unknown; error: Error | null }): Result {
  if (error) throw error;
  return resultSchema.parse(data);
}

/** The signed-in person's role, if any. Shows the Admin entry; grants nothing by itself. */
export function useAdminRole(userId: string | null) {
  return useQuery({
    queryKey: roleKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AdminRole | null> => {
      const { data, error } = await supabase.rpc('get_my_admin_role');
      if (error) throw error;
      return roleSchema.parse(data).role;
    },
  });
}

export function useModerationQueue() {
  return useQuery({
    queryKey: queueKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('moderation_queue');
      if (error) throw error;
      return queueSchema.parse(data);
    },
  });
}

export function useAdminAccount(id: string) {
  return useQuery({
    queryKey: accountKey(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_account_detail', { p_user: id });
      if (error) throw error;
      const parsed = resultSchema.parse(data);
      return parsed.ok ? accountSchema.parse(data) : null;
    },
  });
}

export function useAdminPlans() {
  return useQuery({
    queryKey: plansKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_plans');
      if (error) throw error;
      return plansSchema.parse(data).plans;
    },
  });
}

export function useAdminFlags() {
  return useQuery({
    queryKey: flagsKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_flags');
      if (error) throw error;
      return flagsSchema.parse(data).flags;
    },
  });
}

const refreshQueue = () => queryClient.invalidateQueries({ queryKey: queueKey });
const refreshAccount = (id: string) => queryClient.invalidateQueries({ queryKey: accountKey(id) });

export async function findAccount(query: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('admin_find_account', { p_query: query });
  if (error) throw error;
  const parsed = resultSchema.extend({ id: accountSchema.shape.id.optional() }).parse(data);
  return parsed.ok && parsed.id ? parsed.id : null;
}

export async function setAccountState(
  id: string,
  state: 'active' | 'suspended' | 'banned',
  reason: string | null,
  until: string | null,
) {
  const outcome = result(
    await supabase.rpc('moderation_set_state', {
      p_user: id,
      p_state: state,
      p_reason: orNull(reason),
      p_until: orNull(until),
    }),
  );
  await Promise.all([refreshAccount(id), refreshQueue()]);
  return outcome;
}

export async function resolveReport(id: string, actionTaken: boolean, note: string) {
  const outcome = result(
    await supabase.rpc('moderation_resolve_report', {
      p_report: id,
      p_actioned: actionTaken,
      p_note: note,
    }),
  );
  await refreshQueue();
  return outcome;
}

export async function reviewPhoto(id: string, approve: boolean) {
  const outcome = result(
    await supabase.rpc('moderation_review_photo', {
      p_photo: id,
      p_approve: approve,
      p_reason: orNull(approve ? null : 'photo_rules'),
    }),
  );
  await refreshQueue();
  return outcome;
}

export async function decideAppeal(id: string, restore: boolean, note: string) {
  const outcome = result(
    await supabase.rpc('moderation_decide_appeal', {
      p_appeal: id,
      p_restore: restore,
      p_note: note,
    }),
  );
  await refreshQueue();
  return outcome;
}

export async function reviewDateFlag(id: number, invalidate: boolean, note: string) {
  const outcome = result(
    await supabase.rpc('moderation_review_date_flag', {
      p_flag: id,
      p_invalidate: invalidate,
      p_note: note,
    }),
  );
  await refreshQueue();
  return outcome;
}

export async function updatePlan(id: string, pricePaise: number, likes: number, active: boolean) {
  const outcome = result(
    await supabase.rpc('admin_update_plan', {
      p_plan: id,
      p_price_paise: pricePaise,
      p_right_swipes: likes,
      p_active: active,
    }),
  );
  await queryClient.invalidateQueries({ queryKey: plansKey });
  return outcome;
}

export async function grantLikes(id: string, quantity: number, reason: string) {
  const outcome = result(
    await supabase.rpc('admin_grant_likes', {
      p_user: id,
      p_quantity: quantity,
      p_reason: reason,
    }),
  );
  await refreshAccount(id);
  return outcome;
}

export async function grantPlan(id: string, plan: string, reason: string) {
  const outcome = result(
    await supabase.rpc('admin_grant_plan', { p_user: id, p_plan: plan, p_reason: reason }),
  );
  await refreshAccount(id);
  return outcome;
}

export async function setFlag(key: string, value: boolean | number) {
  const outcome = result(await supabase.rpc('admin_set_flag', { p_key: key, p_value: value }));
  await queryClient.invalidateQueries({ queryKey: flagsKey });
  return outcome;
}

/** The restricted person's own side of an appeal. */
export function useMyAppeal(userId: string | null) {
  return useQuery({
    queryKey: appealKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_appeal');
      if (error) throw error;
      return appealSchema.parse(data).appeal;
    },
  });
}

export async function submitAppeal(userId: string, message: string) {
  const outcome = result(await supabase.rpc('submit_appeal', { p_message: message.trim() }));
  await queryClient.invalidateQueries({ queryKey: appealKey(userId) });
  return outcome;
}

export type { ReportCategory };
