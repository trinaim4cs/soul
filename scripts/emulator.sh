#!/usr/bin/env bash
# Boots the SOUL emulator entirely from D: (C: is nearly full; see AGENTS.md disk rule).
# ANDROID_HOME must also point at D:, or the emulator prefers the system SDK on C:.
export ANDROID_SDK_ROOT='D:\soul-dev\android-sdk'
export ANDROID_HOME='D:\soul-dev\android-sdk'
export ANDROID_AVD_HOME='D:\soul-dev\avd'
exec /d/soul-dev/android-sdk/emulator/emulator.exe -avd soul_pixel_api36 -no-snapshot-save -no-boot-anim -gpu host -memory 2048 "$@"
