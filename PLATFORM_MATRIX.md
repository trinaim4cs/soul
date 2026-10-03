# SOUL: Platform Matrix

One Expo Router codebase, one Supabase backend (DECISIONS D-035, D-036).

| | Android (native APK) | iPhone (PWA, Safari) | Future native iOS |
|---|---|---|---|
| Distribution | direct APK from the SOUL site (`/download`); no Play Store in V1 | Safari → Add to Home Screen (`/install`) | App Store (later) |
| Runtime | React Native (New Architecture), dev and release builds | react-native-web in Safari, standalone display | React Native |
| Account and data | same Supabase account, profile, matches, chat, swipes, plans, badges | same | same |
| Sign-in | SRMIST email + 6-digit OTP (server domain gate) | same | same |
| Session storage | Keystore-backed SecureStore | `localStorage` + strict CSP (D-040) | Keychain SecureStore |
| Fonts | embedded natively (expo-font config plugin) | registered with weight descriptors (`fonts.web.ts`) before first render | embedded |
| Icons | SoulIcons (Material Symbols subset) embedded; glyph map `src/theme/icons.ts` | the same subset registered on the web | embedded |
| Tab bar | NativeTabs (Material bottom navigation) | `_layout.web.tsx`: JS bottom tabs with SoulIcons (same tab list) | NativeTabs (UITabBar) |
| Keyboard / composer | react-native-keyboard-controller | `visualViewport`-driven offset (Phase 9) | keyboard-controller |
| Location (Instant only) | expo-location, foreground only | `navigator.geolocation` (HTTPS), foreground only | expo-location |
| Heading / compass | device heading via expo-location or sensors, damped | `DeviceOrientationEvent` (+ iOS permission prompt); when unreliable, **"Direction unavailable on this device"** while distance, chat, timer and End Meet keep working | expo-location heading |
| Camera (profile photo) | native camera capture | `<input capture>` / getUserMedia where supported; the same upload pipeline | native |
| Push | FCM (C-16) | Web Push for installed PWAs on iOS 16.4+ (C-16); the app works without push | APNs |
| Payments | SOUL web checkout (D-037) | SOUL web checkout | web checkout or IAP adapter later |
| Updates | in-app update prompt from `app_config.android_release` (D-039) | new deploy + service-worker update | App Store |
| Offline | cached UI state only | app-shell service worker, no private data cached (D-040) | same as Android |

## Service adapters (`src/services/`)

| Service | Native (`index.ts`) | Web (`index.web.ts`) |
|---|---|---|
| `secure-storage` | expo-secure-store | localStorage |
| `location` | expo-location (foreground) | navigator.geolocation |
| `heading` | expo-location heading | DeviceOrientation (`webkitCompassHeading` on iOS) with capability detection |
| `camera` | expo-image-picker / camera | file input with `capture` |
| `notifications` | expo-notifications + FCM | Web Push via service worker |
| `payments` | web checkout (in-app browser) | web checkout (redirect) |
| `device-integrity` | Play Integrity (when available) + mock-location flag | not available; server-side risk signals only |

Built now: `secure-storage` (the Supabase session), `install-context` (which install hint to show) and `pwa` (service-worker registration). The others have their contract in `types.ts` and are implemented in their feature phases (camera: 5, location and heading: 10, payments: 12, device-integrity: 13, notifications: 14).

Screens call the service interface. Platform branching lives only inside these adapters (and in theme font/icon loading).

## Cross-platform test matrix (spec amendment section 25)

Status after Phase 16 (TESTING.md). "Scripted" means the other person acted through the API with their own session, which is the same server path the app uses.

| Scenario | Status |
|---|---|
| Android ↔ Android match | **Verified with one emulator and a scripted second account** (Phase 8, 16); simultaneous likes from two clients make one match (`db:verify`). Two physical Android phones: not yet |
| Android ↔ PWA match (both directions) | **Verified:** matches made on Android show on the web account and the other way round; both people then used Android and the web together (Phase 8, 9, 16) |
| Chat across platforms | **Verified:** Android ↔ browser live both ways, read receipts, typing, retry after a dropped gateway, replies (Phase 9); again in Phase 16 with live "Read" on both sides |
| Same account on both platforms | **Verified:** the web test account signed in on Android and landed in the tabs (Phase 5) |
| Same subscription and swipe balance across platforms | **Verified:** one balance on the server; likes granted from the Android admin appeared on the web account's Discover (Phase 15); a plan bought on Android is the account's plan everywhere (Phase 12) |
| Block and unmatch across platforms | **Verified:** a browser unmatch turned the open Android chat into "This conversation isn't available" (Phase 9); a block from the web account did the same, live (Phase 16) |
| Hot Person consistency | **Verified:** the fire on cards and profiles on the web and Android (Phase 11) |
| Instant ≤ 1 km and > 1 km; Android ↔ PWA; PWA without heading; permission denied on each | **Partly:** ≤ 1 km and > 1 km on both platforms, the PWA without a compass ("Direction unavailable on this device"), denied permission on Android (Phase 10). One Android and one PWA in the same meet: not yet |
| Realtime reconnect | **Partly:** a message sent while the gateway was down was retried and stored once (Phase 9). Socket recovery after real network loss: Phase 19 |
| Payment entitlement propagation | **Verified on the mock provider:** the signed webhook grants and nudges every device of the account (Phase 12). Live Razorpay: C-25 |
