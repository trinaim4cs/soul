// Push configuration (DECISIONS D-054). Either channel may be missing: SOUL works without
// push, and a channel with no secrets simply stays off.

import { parseServiceAccount, type ServiceAccount } from './fcm.ts';
import type { VapidKeys } from './webpush.ts';

/** Web Push: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (base64url) and VAPID_SUBJECT (mailto:). */
export function vapidKeys(): VapidKeys | null {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** Android: FCM_SERVICE_ACCOUNT, the Firebase service account JSON. */
export function fcmAccount(): ServiceAccount | null {
  return parseServiceAccount(Deno.env.get('FCM_SERVICE_ACCOUNT'));
}
