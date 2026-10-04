# SOUL: Performance (Phase 19)

Spec section 73. Done on 2026-10-04 with the **release-optimised test APK** (`npm run android:test-apk`: Hermes bytecode, no developer menu, no Metro) on the Android emulator (Pixel profile, API 36, x86_64, 2 GB) against the local stack, plus a code review of every item. Decision record: DECISIONS D-058.

**What an emulator can and cannot say.** Sizes, memory, request counts, location request intervals and reconnect behaviour are real measurements. Frame times and start-up times on an emulator running on a busy laptop are only indicative: they are slower and noisier than a mid-range phone. Feel on the slowest supported real phone stays on the release checklist.

## Measured

| Item | Before | After Phase 19 | How |
|---|---|---|---|
| APK size, x86_64 only | 49 MB | **23 MB** | `dist-android/` |
| Native libraries in the APK | 23 MB (stored uncompressed) | 7.8 MB (23 MB raw, compressed) | compressed inside the APK (`useLegacyPackaging`) |
| App code (dex) in the APK | 17 MB (48 MB raw) | 6.9 MB (17 MB raw) | R8 shrinking |
| JS bundle (Hermes bytecode) | 5.2 MB | 5.2 MB | `assets/index.android.bundle` |
| Production APK (phones: arm64-v8a + armeabi-v7a) | about 95 MB projected with x86_64 and uncompressed libraries | about 28 MB projected (built only with the owner's key) | see "Size" |
| Cold start to first frame (`am start -W`, 5 runs) | 2.7 to 3.3 s (5.3 s on the first launch after install) | **1.9 to 2.5 s** (7.0 s on the first launch after install, while Android compiles the code) | emulator |
| Memory after using Discover, a chat and Instant (PSS) | 166 to 179 MB (code 66 to 78 MB) | **152 MB** (code 53 MB) | `dumpsys meminfo` |
| Chat scrolling | 220 frames, 3.2 % janky, median 18 ms, 90th 28 ms | (not re-measured) | `dumpsys gfxinfo` |
| Card drag and fling | median 28 ms, 13 % janky (emulator GPU) | (not re-measured) | indicative only |
| Web bundle | 3.9 MB, **898 kB gzipped**, one file | unchanged | `expo export -p web` |
| GPS while searching | high accuracy every **5 s** | high accuracy every **20 s** | `dumpsys location`: `ProviderRequest[@+20s0ms, HIGH_ACCURACY]` |
| GPS in a live meet | every 5 s | every 5 s | `ProviderRequest[@+5s0ms, HIGH_ACCURACY]` |
| GPS after End Meet or Instant off | off | off | `ProviderRequest[OFF]`, location icon gone |
| Reconnect after the network drops | a message sent while offline appeared within 12 s of the network returning; the offline notice showed and cleared | same | `svc wifi/data disable` |

**R8 checked for breakage:** on the shrunk build, sign-in state, Discover, a chat (sending a message), photos, the system photo picker, Instant on and off, notifications settings, Settings and the update prompts all worked, with no crash in the log. The production build has the same settings.

## Item by item

| Item | Finding | Change |
|---|---|---|
| **Startup** | The native splash stays up until the account state is known (one RPC after the session is read from the Keystore), then fades in 200 ms: no blank frame. Fonts are embedded, so nothing loads at start. Code was not shrunk. | R8 and resource shrinking in release builds; the account-state request never waits for the network monitor (offline it fails into "Can't reach SOUL" with Retry instead of holding the splash). |
| **Memory** | 166 to 179 MB PSS, mostly mapped code and the Hermes heap; no growth across screens. Images go through `expo-image` with memory and disk caches. | R8 cuts mapped code. |
| **Scrolling** | Chat is a FlashList with 40-message pages; the matches list is short. Discover is a two-card stack, not a list, so the next card is already rendered (its photo loads before it is needed). | none needed |
| **Images** | Every photo is a signed URL. Each screen signed its own, so the same photo got a new URL (and the cache a new entry) on the card, the profile, the match row and the chat header, and every renewal downloaded it again. | Signed URLs are reused across screens while they have 15 minutes left (fewer signing requests); the device cache is keyed on the URL without its token, so renewals hit the cache (`src/features/profile/api/signed-urls.ts`, `src/lib/image-source.ts`). |
| **Animations** | Swipe, reveal and compass run on the UI thread (Reanimated); press feedback is a CSS transition. Reduced motion is respected (MOTION_SYSTEM.md). | none needed |
| **Chat** | Paged, optimistic send, typing sent at most every 2.5 s, read receipts batched to the newest message. | none needed |
| **Realtime** | One socket; the account topic plus the open chat. A refused topic used to slow the others (Phase 18 F-11, fixed). | none further |
| **Battery** | No background work at all: no background location, no foreground service, no background fetch. Queries stop polling when the app is in the background. | GPS while searching every 20 s instead of 5 s (see below). |
| **Instant GPS usage** | Searching asked for a high-accuracy fix every 5 s, although the server keeps a position for 90 s and matches on a ~110 m grid. | Two modes: **search** every 20 s, **session** every 5 s. High accuracy stays in both, because a coarse fix can exceed the server's 200 m limit indoors; there is no distance filter, so someone standing still still refreshes before their fix expires. Verified on the device above. |
| **Query volume** | Idle on Discover: about one request every 5 minutes (matches), plus focus refetches. Instant searching: state and candidates every 8 s, position every 20 s (was 5 s), about 18 requests a minute (was about 27). In a meet: state and position every 5 s, about 24 a minute. | position cadence above |
| **Reconnect** | Phones never told React Query when they went offline, so every read failed through its retries and nothing refetched when the network came back (only the Realtime rejoin caught up). | `expo-network` feeds React Query's online state: reads pause offline and refetch on return; a quiet "You're offline" note shows on every signed-in screen (below the header, never blocking a touch). Writes never wait to replay later. Verified on the device above. |

## Size

Phase 19 found the production APK would be large: native libraries are stored uncompressed (23 MB per ABI) and the app code was not shrunk. Changes:
- `expo-build-properties`: `enableMinifyInReleaseBuilds` (R8), `enableShrinkResourcesInReleaseBuilds`, `useLegacyPackaging` (compressed native libraries; a smaller download in exchange for a slightly larger install).
- The production APK targets phones only: `arm64-v8a` and `armeabi-v7a` (x86_64 is only for emulators; `ABIS=` overrides).

## Not verifiable here

- Frame times and start-up on a real low-end phone (release checklist).
- Battery drain over a real Instant session outdoors (the request intervals above are what matter, and they are verified).
- Web performance on a real iPhone in Safari.
- **Web bundle (898 kB gzipped, one file):** acceptable for a PWA that the service worker caches after the first visit. Splitting it by route would help the first visit; recorded for after launch rather than done now, because Expo Router's lazy web bundles are still experimental.
