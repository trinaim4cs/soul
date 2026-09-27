/**
 * How SOUL is being run, which decides the install hint (DECISIONS D-038):
 * - `native-app`: the Android APK (or a future native iOS build). No hint.
 * - `installed-pwa`: the web build opened from the Home Screen. No hint.
 * - `ios-browser`: Safari (or another browser) on iPhone or iPad. Show "Add to Home Screen".
 * - `android-browser`: a browser on Android. Offer the APK download.
 * - `other-browser`: desktop and everything else. Point to the phone options.
 */
export type InstallContext =
  'native-app' | 'installed-pwa' | 'ios-browser' | 'android-browser' | 'other-browser';

export type BrowserSignals = {
  userAgent: string;
  /** `display-mode: standalone` matched, or iOS `navigator.standalone`. */
  standalone: boolean;
  maxTouchPoints: number;
};

export function classifyBrowser({
  userAgent,
  standalone,
  maxTouchPoints,
}: BrowserSignals): InstallContext {
  if (standalone) return 'installed-pwa';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios-browser';
  // iPadOS 13+ reports a desktop Mac user agent; touch support gives it away.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios-browser';
  if (/Android/i.test(userAgent)) return 'android-browser';
  return 'other-browser';
}
