# SOUL: Architecture Map

Status: Phases 0 to 4 built (Android verified); the platform amendment (phase P) is in progress. Sections marked *(planned)* are not built yet. This file is updated as each phase lands.

## 1. System overview

One Expo Router codebase ships to two platforms (DECISIONS D-035): a native Android APK downloaded from the SOUL website, and an iPhone PWA installed from Safari. Both talk to the same Supabase backend.

```
┌──────────── Android APK (React Native, New Arch) ────────────┐   ┌──────────── iPhone PWA (react-native-web, Safari) ────────────┐
│ Expo Router routes (src/app) → feature screens (src/features) │   │ the same routes, screens, theme and components                 │
│ TanStack Query · small Zustand stores · Zod                   │   │ the same                                                       │
│ services/*.native.ts: SecureStore session, expo-location,     │   │ services/*.web.ts: localStorage session (D-040), geolocation,  │
│ heading, camera, FCM, integrity                               │   │ DeviceOrientation heading (capability-detected), file capture, │
│ fonts + icon font embedded at build time                      │   │ Web Push · fonts + icon font loaded before first render        │
└──────────────┬────────────────────────────────────────────────┘   │ app-shell-only service worker (never caches private data)      │
               │                                                    └──────────────┬─────────────────────────────────────────────────┘
               │  user JWT + publishable key · private Realtime channels           │
               v                                                                   v
┌─────────────────────────────────────────────── Supabase ───────────────────────────────────────────────┐
│ Auth: email OTP + before_user_created domain allowlist hook (srmist.edu.in)                             │
│ PostgREST → RLS-protected tables + SECURITY DEFINER RPCs (get_my_status, swipe_right, discovery_feed …) │
│ Postgres + PostGIS (Instant Meet 1 km proximity only) · pg_cron (badges, expiries)                      │
│ Realtime (Broadcast/Presence, authorized by RLS on realtime.messages)                                   │
│ Storage (profile-photos, profile-photos-blurred, report-evidence, chat-media), all private             │
│ Edge Functions (Deno): payments-checkout, payments-webhook, instant-*, moderation-*, push              │
└──────────────┬──────────────────────────────────────────────────────────────────────────┬──────────────┘
               │ service-role and provider secrets live only here                         │ signed webhook
               v                                                                          │
  External: payment provider (C-25) ─────────────────────────────────────────────────────┘ · FCM + VAPID Web Push (C-16)

  SOUL website (same web build, C-26): /  (the app) · /download (APK + SHA-256) · /install (Add to Home Screen guide)
```

## 2. Client layers

| Layer | Folder | Responsibility |
|---|---|---|
| Routes | `src/app` | URL structure, guards, params. No UI logic beyond composing a screen. |
| Features | `src/features/<domain>` | screens, feature components, API hooks (TanStack Query), models (Zod) |
| Primitives | `src/components` | Soul* design-system components (spec 53), reused across features |
| Theme | `src/theme` | tokens: colour, type, spacing, radii, borders, motion, layers, sizes, icons |
| Lib | `src/lib` | supabase client, query client, env/config, error types, logger |
| Services | `src/services/<capability>` | platform capabilities behind small interfaces, one `*.native.ts` and one `*.web.ts` per capability (section 2a) |
| Stores | `src/stores` | small client-only state (session snapshot, UI prefs, active Instant UI) |

Feature domains: `auth`, `verification`, `profile`, `discovery`, `matching`, `chat`, `instant`, `billing`, `badges`, `privacy`, `moderation`, `settings`, `location`.

## 2a. Platform layer (D-036)

Screens never branch on `Platform.OS`. Platform differences live in three places only:

1. **`src/services/<capability>/`**: `index.ts` declares the interface; Metro resolves `*.native.ts` (Android, future iOS) or `*.web.ts` (PWA).

   | Capability | Native | Web | Missing capability |
   |---|---|---|---|
   | `secure-storage` | expo-secure-store (Keystore) | localStorage (D-040) | never missing |
   | `location` | expo-location, foreground only | `navigator.geolocation` (HTTPS) | `denied` / `unavailable` state |
   | `heading` | expo-location heading | `DeviceOrientationEvent` (+ iOS permission) | `unavailable`: Instant shows "Direction unavailable on this device" |
   | `camera` | image picker / camera | `<input type=file capture>` | library pick only |
   | `notifications` | expo-notifications + FCM (C-16) | Web Push, installed PWA on iOS 16.4+ | the app works without push |
   | `payments` | web checkout in an in-app browser | web checkout redirect | mock provider in development only |
   | `device-integrity` | Play Integrity when configured + mock-location flag | none (server-side risk signals only) | `unavailable` |

2. **`src/theme/fonts*`**: brand fonts and the icon font are embedded natively by the expo-font config plugin, and registered on the web with weight descriptors before first render.
3. **`src/app/+html.tsx`** (web only): the HTML shell with the viewport, Apple PWA meta tags, the manifest link and the service-worker registration.

On the web, the app is rendered in a phone-width column (at most 480 px) centred on larger screens, so it never looks like a desktop site.

## 3. Route guards (server-state driven)

The root layout reads **one** server-computed account status (`get_my_status()` RPC). Guards (`Stack.Protected`) switch between the groups:

1. no session → `(auth)`
2. session, eligibility incomplete → `(onboarding)`, resumed at the first incomplete step from server state
3. eligible → `(app)`

Location never gates the app (spec v2: no geofence). Only the Instant tab asks for location, when the user turns Instant Meet on.

## 4. Domain → backend map *(planned)*

| Domain | Tables (indicative) | Server logic |
|---|---|---|
| Accounts | `profiles` (public projection), `account_private` (DOB, prefs, settings), `devices`, `push_tokens` | status RPC, account deletion function |
| Verification | SRMIST email + OTP only (D-027): `account_private.institutional_email_verified_at`, terms and DOB columns | Auth `before-user-created` hook, `accept_terms()`, `set_date_of_birth()`, `get_my_status()` |
| Photos | `profile_photos` (moderation state, order, blurred derivative ref) | upload-intent + moderation functions |
| Location (Instant Meet only) | `private.instant_presence` (private schema, no client access) | 1 km `ST_DWithin` candidacy on a ~110 m grid, proximity buckets (D-030, D-031, D-050) |
| Discovery | `preferences`, `passes`, `likes` | `discovery_feed()` (filters, privacy, blocks, ranking) |
| Economy | `plans`, `subscriptions`, `swipe_credit_ledger` (Phase 7, D-047); `purchase_records` (Phase 12) | `swipe_right()` transaction, `get_my_swipes()`, `activate_plan()`; app code in `src/features/swipes` |
| Matching | `matches` (Phase 8, D-048) | inside `swipe_right()`; `get_my_matches()`, `get_match()`, `mark_match_seen()`, `unmatch()`; app code in `src/features/matching` |
| Chat | `conversations`, `conversation_members`, `messages` (Phase 9, D-049) | `send_message()` + broadcast trigger, `get_messages()`, `mark_conversation_read()`; typing via Broadcast on a client topic; app code in `src/features/chat` |
| Instant | `private.instant_presence`, `private.instant_accepts`, `private.instant_skips`, `instant_sessions`, session `conversations` | `instant_start`, `instant_stop`, `instant_update_location`, `instant_candidates`, `instant_accept`, `instant_skip`, `instant_state`, `instant_end_session` (SQL functions, no Edge Function; D-050) |
| Dates and badges | `date_rounds`, `date_review_flags`, `private.hot_person_state` | `date_state`, `answer_date`, `get_my_dates`, `invalidate_date`; badge computed live in the card function; hourly `pg_cron` consistency job (D-051) |
| Safety | `blocks`, `reports`, `report_attachments`, `moderation_actions`, `risk_signals`, `appeals` | report/block functions, admin functions |
| Platform | `feature_flags`, `app_config` (e.g. free cadence), `audit_events`, `admin_roles` | read-only flags for clients; admin-only writes |

## 5. Key flows *(planned)*

- **Right swipe:** client → `swipe_right(target, idempotency_key)`. In one transaction: lock entitlement, check eligibility and blocks, insert like, consume a credit if new, create the match if reciprocal. Returns `{liked, matched, match_id, balance}`.
- **Sign-in:** Rules ticked → SRMIST email → Auth hook checks the domain → 6-digit OTP email → session → `get_my_status()` → onboarding (18+ DOB, then profile) → app.
- **Instant (built, D-050):** opt-in (entitled, 15/30/60 min) → presence row → the device posts its position every 5 s in the foreground → candidates within 1 km (no distance or direction) → both accept → session + session chat → `instant_state` returns `{distance_m | null, bearing | null, nearby, located}` → End Meet, Turn off, expiry or a block deletes the positions for both. No meeting points (not in spec v2).
- **Message:** `send_message()` validates membership, blocks and rate limit, inserts, and the trigger broadcasts to the private topic. Receipts are updated through an RPC.
- **Purchase (built, D-052):** the client asks `payments-checkout` for an order for a catalog item (price frozen on the server) → a Razorpay Payment Link (Android: in-app browser tab; web: same tab) → Razorpay calls `payments-webhook` → signature, then the order's amount, link and currency → `activate_plan` once → the user topic nudges the app, which re-reads. `payments-sync` covers lost webhooks; refunds revoke. The client never grants anything and never sees provider secrets. Play Billing and Apple IAP remain possible later adapters.
- **Android update (D-039):** the app reads `app_config.android_release`, compares it with its own version, and shows an update prompt (forced below `min_supported_version`) that links to `/download`.

## 6. Environments

| Env | App | Backend | Fixtures |
|---|---|---|---|
| development | Android dev client and `npm run web`, `APP_ENV=development` | local Supabase (Docker) or dev project | mock payment provider allowed (server flag) |
| production | release APK from the SOUL site + the PWA build, `APP_ENV=production` | prod project | mock provider compiled out and refused server-side |

## 7. Reference repositories (consulted, not vendored)

Reanimated and Gesture Handler docs for every gesture and animation (swipe card, sheets, composer, typing dots, compass interpolation, match reveal). React Native and Expo sources for native behaviour. Playwright MCP is reference-only; web (PWA) checks run in an iPhone-size viewport in the in-app browser. See `skills/SOUL_SKILL_MAP.md`.
