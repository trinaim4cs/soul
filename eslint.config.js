// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const HEX_COLOR = '/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/';

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'android/*',
      'ios/*',
      'skills/*',
      'supabase/functions/*',
      'receipts/*',
      'review-receipts/*',
    ],
  },
  {
    // The PWA service worker runs in a ServiceWorkerGlobalScope, not the app.
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    // Design tokens are the only place colour literals may live (DECISIONS D-003).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/theme/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=${HEX_COLOR}]`,
          message: 'Use colour tokens from @/theme instead of hex literals.',
        },
      ],
    },
  },
]);
