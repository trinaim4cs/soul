#!/usr/bin/env bash
# Release-mode Android builds (Phase 20, BUILD_ANDROID.md).
#
#   npm run android:test-apk   A release-optimised TEST APK: no developer menu, Hermes bytecode,
#                              talks to the LOCAL Supabase (10.0.2.2 on the emulator), signed
#                              with the development (debug) key. For measuring and checking on
#                              this machine; never published. ABIS=x86_64 by default.
#   npm run android:release    The PRODUCTION APK: .env.production (the hosted project), the
#                              production signing key, every phone ABI. Writes dist-android/
#                              (APK, SHA-256, latest.json, the release SQL) and copies the APK
#                              and latest.json into public/downloads/ for the website.
#
# Gradle caches stay on D: and the build is memory-capped (AGENTS.md). Stop the emulator and
# Docker first: this machine has 15 GB of RAM and its page file on C:.
set -euo pipefail
MODE="${1:-test}"
cd "$(dirname "$0")/.."
export JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-17.0.20.1+1"
export PATH="$JAVA_HOME/bin:$PATH"
export GRADLE_USER_HOME="D:/soul-dev/gradle"
ADB=/d/soul-dev/android-sdk/platform-tools/adb.exe
BUILD_TOOLS=$(ls -d /d/soul-dev/android-sdk/build-tools/* 2>/dev/null | sort -V | tail -1 || true)

if [ "${FORCE:-0}" != "1" ]; then
  if "$ADB" devices 2>/dev/null | grep -q "emulator-"; then
    echo "Stop the emulator before a release build (FORCE=1 to override)." >&2
    exit 1
  fi
  if command -v docker >/dev/null 2>&1 && [ -n "$(docker ps -q 2>/dev/null)" ]; then
    echo "Stop Docker (npm run db:stop) before a release build (FORCE=1 to override)." >&2
    exit 1
  fi
fi

# Reads KEY=value lines from an env file into the environment (comments skipped), so these
# values win over any other .env file Expo would load.
load_env() {
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%$'\r'}"
    case "$line" in '' | \#*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    value="$(printf '%s' "$value" | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//')"
    export "$key=$value"
  done <"$1"
}

VERSION=$(node -p "require('./package.json').version")
case "$MODE" in
  test)
    load_env .env
    export APP_ENV=development SOUL_LOCAL_BACKEND=1
    ABIS="${ABIS:-x86_64}"
    # The development identity: the same debug key as the dev build, never the production one.
    export SOUL_RELEASE_STORE_FILE="$PWD/android-debug.keystore"
    export SOUL_RELEASE_STORE_PASSWORD=android SOUL_RELEASE_KEY_ALIAS=androiddebugkey SOUL_RELEASE_KEY_PASSWORD=android
    ;;
  production)
    [ -f .env.production ] || { echo "Missing .env.production (npm run env:init -- production)." >&2; exit 1; }
    load_env .env.production
    unset SOUL_LOCAL_BACKEND
    node scripts/env.mjs check production --app
    ABIS="${ABIS:-arm64-v8a,armeabi-v7a}"
    ;;
  *)
    echo "Usage: scripts/android-release.sh test|production" >&2
    exit 2
    ;;
esac

echo "== SOUL $VERSION, $MODE build ($ABIS)"
# Name, cleartext policy and blocked permissions depend on the mode, so ./android is regenerated.
npx expo prebuild --platform android --clean --no-install
# The dev build script regenerates ./android after this (scripts/android-build.sh).
echo "$MODE" >android/.soul-build-mode
if [ "$MODE" = test ]; then
  cp android/app/debug.keystore "$SOUL_RELEASE_STORE_FILE"
fi
# EXPO_PUBLIC_* values are inlined into the bundle and Metro caches transformed files: start
# clean so a release can never carry another environment's address.
TMP_DIR=$(node -p "require('os').tmpdir()")
rm -rf "$TMP_DIR"/metro-* "$TMP_DIR"/haste-map-* node_modules/.cache/metro 2>/dev/null || true

(cd android && ./gradlew app:assembleRelease -PreactNativeArchitectures="$ABIS" \
  --max-workers=4 -Dorg.gradle.jvmargs="-Xmx2g -XX:MaxMetaspaceSize=768m" \
  -Pkotlin.compiler.execution.strategy=in-process --console=plain)
(cd android && ./gradlew --stop >/dev/null 2>&1 || true)
[ "$MODE" = test ] && rm -f "$SOUL_RELEASE_STORE_FILE"

APK_IN=android/app/build/outputs/apk/release/app-release.apk
OUT=dist-android
mkdir -p "$OUT"
if [ "$MODE" = test ]; then
  APK_OUT="$OUT/soul-$VERSION-test.apk"
else
  APK_OUT="$OUT/soul-$VERSION.apk"
fi
cp "$APK_IN" "$APK_OUT"
SHA=$(sha256sum "$APK_OUT" | cut -d' ' -f1)
SIZE=$(stat -c %s "$APK_OUT")
echo "$SHA  $(basename "$APK_OUT")" >"$APK_OUT.sha256"
echo
echo "APK      $APK_OUT ($((SIZE / 1000000)) MB)"
echo "SHA-256  $SHA"
if [ -n "$BUILD_TOOLS" ] && [ -f "$BUILD_TOOLS/lib/apksigner.jar" ]; then
  echo "Signer   $(java -jar "$BUILD_TOOLS/lib/apksigner.jar" verify --print-certs "$APK_OUT" | grep -m1 'SHA-256 digest' | sed 's/.*: //')"
fi

if [ "$MODE" = production ]; then
  NAME=$(basename "$APK_OUT")
  printf '{\n  "version": "%s",\n  "url": "/downloads/%s",\n  "sha256": "%s",\n  "sizeBytes": %s\n}\n' \
    "$VERSION" "$NAME" "$SHA" "$SIZE" >"$OUT/latest.json"
  mkdir -p public/downloads
  cp "$APK_OUT" "$OUT/latest.json" public/downloads/
  SITE=$(grep -E '^PAYMENTS_SITE_URL=' supabase/functions/.env.production 2>/dev/null | cut -d= -f2- | sed 's/[[:space:]]*#.*//' || true)
  SITE="${SITE:-https://<your SOUL site>}"
  CODE=$(node -p "const [a,b,c]=require('./package.json').version.split('.').map(Number); a*1e6+b*1e3+c")
  cat >"$OUT/release.sql" <<SQL
-- Run in the Supabase SQL editor AFTER the website serves $SITE/downloads/$NAME (D-039).
-- Keeps the current minimum; to force everyone older to update, replace the min_version_code
-- expression with a number, for example $CODE.
update public.app_config
set value = jsonb_build_object(
      'latest_version', '$VERSION',
      'latest_version_code', $CODE,
      'min_version_code', coalesce((value ->> 'min_version_code')::int, 0),
      'apk_url', '$SITE/download',
      'sha256', '$SHA'),
    updated_at = now()
where key = 'android_release';
SQL
  echo
  echo "Website  public/downloads/ now holds $NAME and latest.json (deploy the site to publish)."
  echo "Prompt   $OUT/release.sql tells installed apps about this version (run it after deploying)."
fi
if [ "$MODE" = test ] && "$ADB" get-state >/dev/null 2>&1; then
  "$ADB" install -r "$APK_OUT"
fi
