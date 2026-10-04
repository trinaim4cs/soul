import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { cachedPushChannels, pushChannels, registerDevice, unregisterDevice } from './server';
import type { NotificationService, PushPermission } from './types';

export type { NotificationService, PushPermission } from './types';

/**
 * Android: expo-notifications with FCM (DECISIONS D-054). One channel; each FCM message is
 * marked private, so a locked phone hides its text (Android lets only the system set a
 * channel's lock-screen visibility). While SOUL is open nothing pops up: the open screen
 * already updates live.
 * Without the owner's Firebase config (C-16) the token request fails and push stays off.
 */
const CHANNEL = 'activity';
let setUp = false;
let lastToken: string | null = null;

function setUpOnce() {
  if (setUp) return;
  setUp = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  // A replaced token is registered again at once (FCM rotates them now and then).
  Notifications.addPushTokenListener((token) => {
    if (typeof token.data === 'string' && token.data !== lastToken) {
      lastToken = token.data;
      void registerDevice({ platform: 'android', token: token.data });
    }
  });
}

async function ensureChannel() {
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Matches and messages',
    description: 'New matches, messages, Instant Meet and payments.',
    importance: Notifications.AndroidImportance.HIGH,
    showBadge: true,
  });
}

function toPermission(status: Notifications.NotificationPermissionsStatus): PushPermission {
  if (status.granted) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

function urlOf(response: Notifications.NotificationResponse): string | null {
  const content = response.notification.request.content.data as { url?: unknown } | null;
  return typeof content?.url === 'string' ? content.url : null;
}

export const notifications: NotificationService = {
  async getPermission() {
    if (Platform.OS !== 'android') return 'unavailable';
    // Not offered until the server can deliver Android push (FCM credentials, C-16): asking
    // for the permission would lead nowhere.
    const channels = await cachedPushChannels().catch(() => null);
    if (channels && !channels.android) return 'unavailable';
    return toPermission(await Notifications.getPermissionsAsync());
  },

  async requestPermission() {
    if (Platform.OS !== 'android') return 'unavailable';
    // Android 13 shows its prompt only once a channel exists.
    await ensureChannel();
    return toPermission(await Notifications.requestPermissionsAsync());
  },

  async register() {
    if (Platform.OS !== 'android') return false;
    setUpOnce();
    try {
      if (!(await Notifications.getPermissionsAsync()).granted) return false;
      await ensureChannel();
      const channels = await pushChannels();
      if (!channels?.android) return false;
      const token = await Notifications.getDevicePushTokenAsync();
      if (typeof token.data !== 'string') return false;
      lastToken = token.data;
      return await registerDevice({ platform: 'android', token: token.data });
    } catch {
      // No Firebase config in this build, or no Play services: SOUL works without push.
      return false;
    }
  },

  async unregister() {
    try {
      const token =
        lastToken ??
        ((await Notifications.getPermissionsAsync()).granted
          ? ((await Notifications.getDevicePushTokenAsync()).data as string)
          : null);
      if (token) await unregisterDevice({ token });
    } catch {
      // Nothing registered here.
    }
    lastToken = null;
  },

  canOpenSettings: Platform.OS === 'android',

  async openSettings() {
    await Linking.openSettings();
  },

  onOpen(handler) {
    setUpOnce();
    const handle = (response: Notifications.NotificationResponse) => {
      const url = urlOf(response);
      if (url) handler(url);
    };
    // A tap that launched the app is handled once.
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      handle(last);
      void Notifications.clearLastNotificationResponseAsync();
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  },
};
