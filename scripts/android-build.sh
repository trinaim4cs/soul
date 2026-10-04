#!/usr/bin/env bash
# Builds and installs the SOUL development build for the x86_64 emulator.
# Gradle caches go to D: (AGENTS.md disk rule). JDK 17 is required.
set -euo pipefail
export JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-17.0.20.1+1"
export PATH="$JAVA_HOME/bin:$PATH"
export GRADLE_USER_HOME="D:/soul-dev/gradle"
ADB=/d/soul-dev/android-sdk/platform-tools/adb.exe
cd "$(dirname "$0")/.."
# A release build (scripts/android-release.sh) leaves ./android configured for release: start over.
if [ ! -d android ] || [ "${CLEAN:-0}" = "1" ] || [ -f android/.soul-build-mode ]; then
  npx expo prebuild --platform android --clean --no-install
fi
# Memory-capped: this machine has 15 GB RAM and a page file on a nearly full C:.
# Stop the emulator and Docker before building (see AGENTS.md).
(cd android && ./gradlew app:assembleDebug   -PreactNativeArchitectures=x86_64   --max-workers=4   -Dorg.gradle.jvmargs="-Xmx2g -XX:MaxMetaspaceSize=768m"   -Pkotlin.compiler.execution.strategy=in-process   --console=plain)
(cd android && ./gradlew --stop >/dev/null 2>&1 || true)
echo "Built android/app/build/outputs/apk/debug/app-debug.apk"
if "$ADB" get-state >/dev/null 2>&1; then
  "$ADB" install -r android/app/build/outputs/apk/debug/app-debug.apk
  "$ADB" reverse tcp:8081 tcp:8081
fi
