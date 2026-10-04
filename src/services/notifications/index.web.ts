import { cachedPushChannels, pushChannels, registerDevice, unregisterDevice } from './server';
import type { NotificationService, PushPermission } from './types';

export type { NotificationService, PushPermission } from './types';

/**
 * Web Push (DECISIONS D-054): the service worker (public/sw.js) receives and shows the
 * notification and routes a tap back into the open app. On iPhone this needs the installed
 * PWA (iOS 16.4+); Safari in a tab has no PushManager, so push reads as unavailable there.
 */
function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function toPermission(value: NotificationPermission): PushPermission {
  if (value === 'granted') return 'granted';
  return value === 'denied' ? 'denied' : 'undetermined';
}

function decodeKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function sameKey(current: ArrayBuffer | null, wanted: Uint8Array): boolean {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === wanted.length && bytes.every((byte, index) => byte === wanted[index]);
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

export const notifications: NotificationService = {
  async getPermission() {
    if (!supported()) return 'unavailable';
    // Not offered until the server has its Web Push keys.
    const channels = await cachedPushChannels().catch(() => null);
    if (channels && !channels.web) return 'unavailable';
    return toPermission(Notification.permission);
  },

  async requestPermission() {
    if (!supported()) return 'unavailable';
    return toPermission(await Notification.requestPermission());
  },

  async register() {
    if (!supported() || Notification.permission !== 'granted') return false;
    try {
      const channels = await pushChannels();
      if (!channels?.web) return false;
      const key = decodeKey(channels.web.publicKey);
      const worker = await registration();
      let subscription = await worker.pushManager.getSubscription();
      // A subscription made with another server key can never be delivered to: replace it.
      if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
      return await registerDevice({
        platform: 'web',
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
    } catch {
      return false;
    }
  },

  async unregister() {
    if (!supported()) return;
    try {
      const worker = await navigator.serviceWorker.getRegistration('/');
      const subscription = await worker?.pushManager.getSubscription();
      if (!subscription) return;
      await unregisterDevice({ endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    } catch {
      // Nothing registered here.
    }
  },

  canOpenSettings: false,

  async openSettings() {
    // Browsers keep site permissions in their own settings; the screen explains where.
  },

  onOpen(handler) {
    if (!supported()) return () => undefined;
    const listener = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (data?.type === 'soul-open' && typeof data.url === 'string') handler(data.url);
    };
    navigator.serviceWorker.addEventListener('message', listener);
    // A tap that opened a new window arrives as the page's own address (sw.js openWindow).
    return () => navigator.serviceWorker.removeEventListener('message', listener);
  },
};
