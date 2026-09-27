import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppEnv = 'development' | 'production';

const APP_ENV: AppEnv = process.env.APP_ENV === 'production' ? 'production' : 'development';
const IS_PRODUCTION = APP_ENV === 'production';

// Locked by the owner (DECISIONS C-04): the Android package, the future iOS bundle id and the
// deep-link scheme. Permanent once people install the APK: every update needs the same id and
// the same production signing key (C-20). Never rename it after the public beta without the
// owner's explicit approval.
const APPLICATION_ID = 'com.soul.srm';

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
              fontFamily: 'PlusJakartaSans',
              fontDefinitions: [
                { path: './assets/fonts/PlusJakartaSans-Regular.ttf', weight: 400 },
                { path: './assets/fonts/PlusJakartaSans-Medium.ttf', weight: 500 },
                { path: './assets/fonts/PlusJakartaSans-SemiBold.ttf', weight: 600 },
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
