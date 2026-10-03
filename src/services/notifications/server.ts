import { supabase } from '@/lib/supabase';

/** What the server can deliver: Web Push needs its public VAPID key, Android needs Firebase. */
export type PushChannels = { web: { publicKey: string } | null; android: boolean };

export type PushDevice =
  | { platform: 'android'; token: string }
  | { platform: 'web'; endpoint: string; keys: { p256dh: string; auth: string } };

export async function pushChannels(): Promise<PushChannels | null> {
  const { data, error } = await supabase.functions.invoke<PushChannels & { ok: boolean }>(
    'push-register',
    { method: 'GET' },
  );
  if (error || !data?.ok) return null;
  return { web: data.web, android: data.android };
}

export async function registerDevice(device: PushDevice): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean }>('push-register', {
    body: { action: 'register', device },
  });
  return !error && data?.ok === true;
}

export async function unregisterDevice(target: { token?: string; endpoint?: string }) {
  await supabase.functions.invoke('push-register', { body: { action: 'unregister', ...target } });
}
