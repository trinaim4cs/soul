import { classifyBrowser } from './model';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

describe('classifyBrowser', () => {
  it('treats a Home Screen launch as installed, on any device', () => {
    expect(classifyBrowser({ userAgent: IPHONE, standalone: true, maxTouchPoints: 5 })).toBe(
      'installed-pwa',
    );
    expect(
      classifyBrowser({ userAgent: ANDROID_CHROME, standalone: true, maxTouchPoints: 5 }),
    ).toBe('installed-pwa');
  });

  it('offers Add to Home Screen on iPhone and iPad', () => {
    expect(classifyBrowser({ userAgent: IPHONE, standalone: false, maxTouchPoints: 5 })).toBe(
      'ios-browser',
    );
    expect(
      classifyBrowser({ userAgent: IPAD_DESKTOP_UA, standalone: false, maxTouchPoints: 5 }),
    ).toBe('ios-browser');
  });

  it('offers the APK on Android browsers', () => {
    expect(
      classifyBrowser({ userAgent: ANDROID_CHROME, standalone: false, maxTouchPoints: 5 }),
    ).toBe('android-browser');
  });

  it('treats a Mac without touch and other desktops as other browsers', () => {
    expect(
      classifyBrowser({ userAgent: IPAD_DESKTOP_UA, standalone: false, maxTouchPoints: 0 }),
    ).toBe('other-browser');
    expect(
      classifyBrowser({ userAgent: DESKTOP_CHROME, standalone: false, maxTouchPoints: 0 }),
    ).toBe('other-browser');
  });
});
