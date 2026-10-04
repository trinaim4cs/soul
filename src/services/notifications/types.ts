/**
 * Push contract (Phase 14, DECISIONS D-054). `index.ts`: expo-notifications + FCM on Android.
 * `index.web.ts`: Web Push through the service worker (installed PWA on iOS 16.4+, desktop and
 * Android browsers). SOUL works fully without push.
 */
/** `not_ready`: the device could, but the server has no credentials for it yet (C-16). */
export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable' | 'not_ready';

export type NotificationService = {
  getPermission(): Promise<PushPermission>;
  /** Asked after the first moment of value (a match) or from Settings, never at launch. */
  requestPermission(): Promise<PushPermission>;
  /** Registers this device's push subscription with the server; returns false when unavailable. */
  register(): Promise<boolean>;
  /** Removes this device from the server before signing out, so the next person gets nothing. */
  unregister(): Promise<void>;
  /** Whether "Open settings" can help after the person said no (the Android app can). */
  canOpenSettings: boolean;
  openSettings(): Promise<void>;
  /** Calls `handler` with the page a tapped notification points to. Returns the unsubscribe. */
  onOpen(handler: (url: string) => void): () => void;
};
