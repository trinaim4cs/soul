import { existsSync, readFileSync } from 'node:fs';

import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppEnv = 'development' | 'production';

const APP_ENV: AppEnv = process.env.APP_ENV === 'production' ? 'production' : 'development';
const IS_PRODUCTION = APP_ENV === 'production';

// Versioning (BUILD_ANDROID.md "Versioning"): package.json holds the one version, bumped with
// `npm version patch|minor|major --no-git-tag-version`. Android's versionCode is derived from
// it, so it always grows when the version does: 1.4.2 becomes 1004002.
const VERSION: string = JSON.parse(readFileSync('./package.json', 'utf8')).version;
function versionCodeOf(version: string): number {
  const parts = version.split('.').map(Number);
  if (
    parts.length !== 3 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 999)
  ) {
    throw new Error(
      `package.json version must be MAJOR.MINOR.PATCH, each 0 to 999 (got ${version})`,
    );
  }
  const [major, minor, patch] = parts as [number, number, number];
  return major * 1_000_000 + minor * 1_000 + patch;
}
const VERSION_CODE = versionCodeOf(VERSION);

// The local test APK talks to the local Supabase over plain HTTP (BUILD_ANDROID.md "Test APK").
const LOCAL_BACKEND = process.env.SOUL_LOCAL_BACKEND === '1';

// A production build must point at the hosted project over HTTPS: never at this machine.
if (IS_PRODUCTION) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  if (!url.startsWith('https://') || /10\.0\.2\.2|localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(
      'APP_ENV=production needs the hosted EXPO_PUBLIC_SUPABASE_URL (https). See .env.production.example.',
    );
  }
  if (LOCAL_BACKEND)
    throw new Error('SOUL_LOCAL_BACKEND is for the local test APK only, never production.');
}

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
  version: VERSION,
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
    versionCode: VERSION_CODE,
    allowBackup: false,
    // Release permission review (BUILD_ANDROID.md "Permissions"): libraries ask for more than
    // SOUL uses. The overlay and Wi-Fi multicast permissions serve the development client;
    // biometrics come with secure storage, which SOUL uses without a fingerprint prompt.
    blockedPermissions: [
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
      ...(IS_PRODUCTION
        ? [
            'android.permission.SYSTEM_ALERT_WINDOW',
            'android.permission.CHANGE_WIFI_MULTICAST_STATE',
          ]
        : []),
    ],
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
    [
      // Release size and start-up (Phase 19, BUILD_ANDROID.md "Size"): R8 shrinks the Java and
      // Kotlin code, unused resources go, and native libraries are compressed inside the APK, so
      // the download from the website is much smaller. Debug builds are unaffected.
      'expo-build-properties',
      {
        android: {
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          useLegacyPackaging: true,
        },
      },
    ],
    // Release builds sign only with the production key from local config (DECISIONS C-20).
    './plugins/with-release-signing',
    // Plain HTTP to the local Supabase, for the local test APK only (never production).
    ...(LOCAL_BACKEND ? ['./plugins/with-local-backend'] : []),
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    APP_ENV,
    // The installed build's number, compared with app_config.android_release (D-039).
    versionCode: VERSION_CODE,
  },
});
