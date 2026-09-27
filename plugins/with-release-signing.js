// Release signing for com.soul.srm (DECISIONS C-20, BUILD_ANDROID.md "Signing").
//
// Expo's Android template signs release builds with the public debug key. A release APK signed
// that way can never be updated by a correctly signed one, so this plugin:
// - keeps debug builds on the development (debug) keystore;
// - signs release builds only with the production keystore, read at build time from a local
//   properties file outside the repository (path in SOUL_RELEASE_SIGNING, or the default below)
//   or from SOUL_RELEASE_* environment variables;
// - fails a release build that has no production signing configured, instead of silently
//   using the debug key.
// No path, password or alias is ever written into the repository.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// soul-release-signing';

const SIGNING_BLOCK = `
    ${MARKER}: values come from a local file or environment, never from the repository.
    def soulSigning = new Properties()
    def soulSigningFile = file(System.getenv('SOUL_RELEASE_SIGNING') ?: 'D:/soul-dev/signing/soul-release.properties')
    if (soulSigningFile.exists()) {
        soulSigningFile.withInputStream { soulSigning.load(it) }
    }
    def soulSigningValue = { String key -> System.getenv('SOUL_RELEASE_' + key) ?: soulSigning.getProperty(key) }
    def soulStoreFile = soulSigningValue('STORE_FILE')
`;

const RELEASE_CONFIG = `
        release {
            if (soulStoreFile) {
                storeFile file(soulStoreFile)
                storePassword soulSigningValue('STORE_PASSWORD')
                keyAlias soulSigningValue('KEY_ALIAS')
                keyPassword soulSigningValue('KEY_PASSWORD')
            }
        }`;

const RELEASE_GUARD = `
    gradle.taskGraph.whenReady { graph ->
        def buildsRelease = graph.allTasks.any { it.name.toLowerCase().contains('release') && it.project == project }
        if (buildsRelease && !soulStoreFile) {
            throw new GradleException('SOUL release signing is not configured. See BUILD_ANDROID.md "Signing". Release builds never use the debug key.')
        }
    }
`;

function applyReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  const signingConfigs = /(\n    signingConfigs \{\n        debug \{[\s\S]*?\n        \})/;
  const releaseUsesDebug =
    /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!signingConfigs.test(gradle) || !releaseUsesDebug.test(gradle)) {
    throw new Error(
      'with-release-signing: android/app/build.gradle no longer matches the expected template. Update plugins/with-release-signing.js.',
    );
  }

  return gradle
    .replace(/(\nandroid \{\n)/, `$1${SIGNING_BLOCK}${RELEASE_GUARD}`)
    .replace(signingConfigs, `$1${RELEASE_CONFIG}`)
    .replace(releaseUsesDebug, '$1signingConfig signingConfigs.release');
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = applyReleaseSigning(mod.modResults.contents);
    return mod;
  });
};

module.exports.applyReleaseSigning = applyReleaseSigning;
