import { existsSync } from 'node:fs';

import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppEnv = 'development' | 'production';

const APP_ENV: AppEnv = process.env.APP_ENV === 'production' ? 'production' : 'development';
const IS_PRODUCTION = APP_ENV === 'production';

// Locked by the owner (DECISIONS C-04): the Android package, the future iOS bundle id and the
// deep-link scheme. Permanent once people install the APK: every update needs the same id and
// the same production signing key (C-20). Never rename it after the public beta without the
// owner's explicit approval.
const APPLICATION_ID = 'com.soul.srm';

// Android push (DECISIONS D-054, C-16): the owner's Firebase app config, kept out of git. Without
// it the app builds and runs normally and simply offers no notifications on Android.
const GOOGLE_SERVICES_FILE = './google-services.json';
const HAS_FIREBASE = existsSync(GOOGLE_SERVICES_FILE);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_PRODUCTION ? 'SOUL' : 'SOUL Dev',
  slug: 'soul',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: APPLICATION_ID,
  // Monochrome light and dark appearances follow the system (DECISIONS D-025).
  userInterfaceStyle: 'automatic',
  // Temporary placeholder: the compact mark is a release blocker (C-21); never the wordmark.
  icon: './assets/images/icon-placeholder.png',
  ios: {
    // Future native iOS build (DECISIONS D-035); the same identity as Android.
    bundleIdentifier: APPLICATION_ID,
  },
  android: {
    package: APPLICATION_ID,
    versionCode: 1,
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: '#000000',
      foregroundImage: './assets/images/adaptive-icon-foreground-placeholder.png',
      monochromeImage: './assets/images/adaptive-icon-foreground-placeholder.png',
    },
    predictiveBackGestureEnabled: false,
    ...(HAS_FIREBASE ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
  },
  // iPhone PWA (DECISIONS D-035): a single-page app. The HTML shell with the PWA meta tags is
  // public/index.html; the manifest, icons and app-shell service worker live in public/.
  web: {
    bundler: 'metro',
    output: 'single',
    lang: 'en',
    name: 'SOUL',
    shortName: 'SOUL',
    description: 'Dating, only for SRM.',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: './assets/brand/derived/soul-logo-black.png',
        // The mark is 734 px wide: 160 dp stays crisp up to xxxhdpi (DECISIONS D-022).
        imageWidth: 160,
        dark: {
          backgroundColor: '#000000',
          image: './assets/brand/derived/soul-logo-white.png',
        },
      },
    ],
    [
      // Brand fonts and the icon font embedded at build time (DECISIONS D-021). On the web the
      // same files are registered by src/theme/fonts.web.ts. Family names are referenced
      // only through src/theme (typography.ts, icons.ts).
      'expo-font',
      {
        android: {
          fonts: [
            {
              fontFamily: 'AlegreyaSans',
              fontDefinitions: [
                { path: './assets/fonts/AlegreyaSans-Regular.ttf', weight: 400 },
                { path: './assets/fonts/AlegreyaSans-Medium.ttf', weight: 500 },
                { path: './assets/fonts/AlegreyaSans-Bold.ttf', weight: 700 },
              ],
            },
            {
              fontFamily: 'InstrumentSerif',
              fontDefinitions: [
                { path: './assets/fonts/InstrumentSerif-Regular.ttf', weight: 400 },
                { path: './assets/fonts/InstrumentSerif-Italic.ttf', weight: 400, style: 'italic' },
              ],
            },
            {
              // Material Symbols subset (src/theme/icons.ts, `npm run icons:subset`).
              fontFamily: 'SoulIcons',
              fontDefinitions: [
                { path: './assets/fonts/SoulIcons-Light.ttf', weight: 300 },
                { path: './assets/fonts/SoulIcons-Regular.ttf', weight: 400 },
              ],
            },
          ],
        },
      },
    ],
    'expo-secure-store',
    [
      // Profile photos only (spec 14). No microphone: SOUL never records video or audio.
      'expo-image-picker',
      {
        photosPermission: 'SOUL uses the photos you choose for your profile.',
        cameraPermission: 'SOUL uses the camera so you can take your profile photo.',
        microphonePermission: false,
      },
    ],
    [
      // Instant Meet only (DECISIONS D-030, D-031, D-050): foreground location while the
      // person has Instant on, and the compass heading. Never in the background, so no
      // background permission and no foreground service.
      'expo-location',
      {
        locationWhenInUsePermission:
          'SOUL uses your location only while Instant Meet is on, to find people within 1 km. Others never see where you are.',
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
    [
      // Push (DECISIONS D-054): a white silhouette for the status bar (placeholder until the
      // compact mark, C-21) and one channel, created by the app with private lock-screen text.
      'expo-notifications',
      {
        icon: './assets/images/notification-icon-placeholder.png',
        color: '#000000',
        defaultChannel: 'activity',
      },
    ],
    // Release builds sign only with the production key from local config (DECISIONS C-20).
    './plugins/with-release-signing',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    APP_ENV,
  },
});
