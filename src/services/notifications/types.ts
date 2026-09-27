/**
 * Push contract (Phase 14, C-16). `index.ts`: expo-notifications + FCM. `index.web.ts`: Web
 * Push through the service worker (installed PWA on iOS 16.4+). SOUL works without push.
 */
export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export type NotificationService = {
  getPermission(): Promise<PushPermission>;
  /** Asked after the first moment of value (a match), never at launch. */
  requestPermission(): Promise<PushPermission>;
  /** Registers this device's push subscription with the server; returns false when unavailable. */
  register(): Promise<boolean>;
};
