import { useQuery } from '@tanstack/react-query';

import {
  settingsSchema,
  type NotificationSettings,
} from '@/features/notifications/model/notifications';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { notifications } from '@/services/notifications';

export const settingsKey = (userId: string) => ['notifications', 'settings', userId] as const;
export const deviceKey = ['notifications', 'device'] as const;

/** Which kinds the person wants (server-side, for every device). */
export function useNotificationSettings(userId: string | null) {
  return useQuery({
    queryKey: settingsKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    queryFn: async (): Promise<NotificationSettings> => {
      const { data, error } = await supabase.rpc('get_notification_settings');
      if (error) throw error;
      return settingsSchema.parse(data);
    },
  });
}

export async function saveNotificationSettings(
  userId: string,
  next: Pick<NotificationSettings, 'matches' | 'messages' | 'instant' | 'payments'>,
) {
  const { error } = await supabase.rpc('set_notification_settings', {
    p_matches: next.matches,
    p_messages: next.messages,
    p_instant: next.instant,
    p_payments: next.payments,
  });
  if (error) throw error;
  await queryClient.invalidateQueries({ queryKey: settingsKey(userId) });
}

/** This device: the permission, and whether the server could register it. */
export function useDevicePush() {
  return useQuery({
    queryKey: deviceKey,
    queryFn: async () => {
      const permission = await notifications.getPermission();
      const registered = permission === 'granted' ? await notifications.register() : null;
      return { permission, registered };
    },
    staleTime: 30_000,
  });
}

/** Asks once, then registers. Used by Settings and the Chats card. */
export async function turnOnPush(userId: string | null) {
  const permission = await notifications.requestPermission();
  if (permission === 'granted') await notifications.register();
  await queryClient.invalidateQueries({ queryKey: deviceKey });
  if (userId) await queryClient.invalidateQueries({ queryKey: settingsKey(userId) });
  return permission;
}
