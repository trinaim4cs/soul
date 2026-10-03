import { z } from 'zod';

import type { PushPermission } from '@/services/notifications';

/**
 * Pages a notification may open (DECISIONS D-054). Mirrors OPENABLE in public/sw.js. A tapped
 * notification is data from outside the app, so anything else is ignored.
 */
const OPENABLE = [
  /^\/chat\/[0-9a-f-]{36}$/,
  /^\/match\/[0-9a-f-]{36}$/,
  /^\/instant\/session\/[0-9a-f-]{36}$/,
  /^\/instant\/chat\/[0-9a-f-]{36}$/,
  /^\/settings\/purchases$/,
];

export function notificationRoute(url: unknown): string | null {
  return typeof url === 'string' && OPENABLE.some((pattern) => pattern.test(url)) ? url : null;
}

export const NOTIFICATION_KINDS = ['matches', 'messages', 'instant', 'payments'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const KIND_COPY: Record<NotificationKind, { title: string; body: string }> = {
  matches: { title: 'New matches', body: 'When someone you liked likes you back.' },
  messages: {
    title: 'Messages',
    body: 'Who wrote to you. The message itself is never shown in the notification.',
  },
  instant: { title: 'Instant Meet', body: 'When you and someone nearby both say yes.' },
  payments: { title: 'Payments', body: 'When a purchase is confirmed or refunded.' },
};

export const settingsSchema = z.object({
  ok: z.literal(true),
  matches: z.boolean(),
  messages: z.boolean(),
  instant: z.boolean(),
  payments: z.boolean(),
  devices: z.number().int().nonnegative(),
});
export type NotificationSettings = z.infer<typeof settingsSchema>;

/** What the device section of Settings → Notifications says. */
export function deviceCopy(
  permission: PushPermission,
  registered: boolean | null,
  isIosBrowser: boolean,
): { title: string; body: string } {
  if (permission === 'unavailable') {
    return isIosBrowser
      ? {
          title: 'Add SOUL to your Home Screen',
          body: 'On iPhone, notifications work once SOUL is on your Home Screen. Open it from there and turn them on.',
        }
      : { title: 'Not available here', body: "This browser can't show notifications from SOUL." };
  }
  if (permission === 'denied') {
    return {
      title: 'Notifications are off',
      body: 'You turned them off for SOUL. You can allow them again in your settings.',
    };
  }
  if (permission === 'undetermined') {
    return {
      title: 'Notifications are off',
      body: 'Turn them on to hear about matches and messages when SOUL is closed.',
    };
  }
  if (registered === false) {
    return {
      title: "Notifications aren't ready yet",
      body: "This version of SOUL can't receive notifications yet. Everything else works as usual.",
    };
  }
  return { title: 'Notifications are on', body: 'On this device, for what you choose below.' };
}
