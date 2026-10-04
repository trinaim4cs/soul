// The local test APK (BUILD_ANDROID.md "Test APK") is a release build that talks to the local
// Supabase on this machine over plain HTTP (10.0.2.2 on the emulator). Release builds refuse
// cleartext by default, so this plugin allows it, and only when SOUL_LOCAL_BACKEND=1 for a
// development build; app.config.ts refuses the combination with APP_ENV=production.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withLocalBackend(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) application.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });
};
