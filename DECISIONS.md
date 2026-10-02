# SOUL: Decisions Log

Each decision records what was chosen, why, and what would change it. Product rules come from the master specification and are not changed here. Where the spec leaves a detail open, the simplest production-safe option is chosen and marked **[DEFAULT, confirm]**. Where a value must come from the owner, it is marked **CONFIG_REQUIRED**, and nothing depending on it is released until it is set.

Status values: `accepted` · `default, confirm` · `open`.

---

## Phase 9 chat (2026-10-02)

### D-049 Chat
- **Model:** one conversation per match, created with it. `conversation_members` holds each person's read position. `messages` are written only by `send_message()`. No table is readable or writable by the app; every function re-checks that the match is still active and visible.
- **Sending:** the body is trimmed and must be 1 to 2000 characters. The device picks a `client_id`, so a retry is stored once. A reply must point at a message in the same conversation. At most 15 messages go through in any 10 seconds.
- **Realtime (settles D-012):** private topics only, authorized by RLS on `realtime.messages`.
  - `chat:<conversation>` carries `message`, `read` and `closed`, published by database triggers and functions. Clients can listen but never publish there, so a message on the wire is always one the server stored.
  - `typing:<conversation>` is the only topic a client may publish on, and it carries nothing but a typing flag.
  - `user:<account>` nudges that account's chat list and tab count when a match or message changes. It replaces the Phase 8 polling; a 5-minute re-read stays as a safety net.
- **Delivery states:** Sending, Sent (stored by the server), Read, and "Not sent. Tap to try again." There is no separate "delivered to the device" state until push exists (Phase 14).
- **Read receipts (settles C-19):** on by default, switched in Privacy. They are mutual: shown only when both people keep them on, and no receipt is broadcast otherwise. A read position only moves forward and cannot pass the newest real message.
- **Unmatch:** closes the conversation, tells both devices (`closed`), and keeps the messages as moderation evidence that neither person can read.
- **Screen:** messages are anchored to the bottom in a FlashList; older pages of 40 load when scrolling up. Bubbles do not animate one by one. The composer floats above the keyboard, grows to five lines and keeps the keyboard open after sending. Long-press replies.
- **Send button:** the word "Send". The icon font has no send glyph, and adding one needs a native rebuild.
- **Not in this phase:** photos in chat (spec: "photo if moderation is ready", so with Phase 13), and report and block from the chat header (Phase 13).
- **Known limitation:** Realtime authorizes a topic when it is joined and again when the token refreshes. After an unmatch the server stops publishing at once, and the app leaves the topic when it receives `closed`; a tampered client could keep an idle socket until its token refreshes, but it receives nothing.

---

## Phase 8 matching (2026-10-02)

### D-048 Matching
- **Creation:** a match is created only inside `swipe_right`, when the other person's like already exists. The transaction holds the caller's credit lock and then a lock on the pair, so two people liking each other at the same moment still produce exactly one match, and each like is charged once (D-015).
- **One row per pair, ever:** `matches` stores the pair in order with a unique constraint. Unmatching sets the row inactive and records who ended it; the row stays as moderation evidence.
- **After an unmatch:** the two never see each other again. Their likes keep them out of each other's Discover, the profile can no longer be opened, photos can no longer be signed, and they cannot like each other again.
- **Who sees a match:** both accounts must still be eligible and neither may have blocked the other. Discovery preferences stop mattering once two people have matched, so a match stays visible if either changes their filters.
- **Seen state:** each person has their own "seen" time.
  - The person whose like completes the match gets the reveal at once.
  - The other person gets a count on the Chats tab and a "NEW" row, and the reveal plays when they open it.
- **Anonymous mode after a match (settles D-016):** `profiles.reveal_on_match`, on by default, and shown in Privacy only when Anonymous is selected. When on, matches see the person's name and original photos. When off, matches still see the blurred copies and no name. Discover is always blurred. Storage applies the same rule when signing photos.
- **Reveal screen:** the black brand surface, both main photos, "It's a match", then **Message** and **Continue** (spec 24). A 360 ms settle and staggered text; no confetti, nothing loops; reduced motion fades only. No haptic yet: `expo-haptics` is a native module and needs a rebuild, so it is left for the Phase 17 polish pass.
- **Message, until Phase 9:** the button closes the reveal and opens Chats, where the match is listed. Phase 9 points it at the conversation.
- **Unmatch:** from the match's profile, with an in-place second step in the pinned footer (no system dialog, so Android and the browser behave the same).
- **Freshness, until realtime (Phase 9):** the app re-reads matches every 60 seconds while open, on returning to the foreground, and whenever Chats is opened.

---

## Phase 7 swipes and plans (2026-10-02)

### D-047 Swipe ledger, plans and the plans screen
- **Catalog:** one `plans` table holds price (paise), right swipes, period and Instant inclusion for the four plans and three top-ups, exactly as the owner priced them (D-013). There is no separate `plan_entitlements` table: every entitlement is a column of the plan. The app renders whatever the catalog returns.
- **Ledger:** `swipe_credit_ledger` is append-only (a trigger refuses edits and deletes; rows go only with the account).
  - A `grant` row is a lot with its own validity window. Plan lots end with the plan period, so nothing rolls over; free and top-up lots never expire (C-12).
  - Every other row draws from one lot.
  - The balance is the sum of what is left in the lots valid now, computed on the server each time.
- **A like** runs in one transaction under a per-account lock. A replay, or liking someone already liked, charges nothing. A new like takes one credit, and with none left nothing is saved (`no_swipes`). Passes are free.
- **Which credit is used:** the lot that expires soonest. So plan swipes go first, then free swipes, then top-ups. This closes the D-013 default: it never wastes swipes that would expire.
- **Free swipes:** 4 from `app_config.free_right_swipes`, granted once when the account first becomes eligible. The grant is remembered by a fingerprint of the SRMIST address, so deleting the account and signing up again does not refill them (C-10).
- **Buying while a plan is active [DEFAULT, confirm]:** a new plan starts at once and runs beside the old one. Each plan's swipes last for its own period, nothing is forfeited, and Instant Meet is on while any active plan includes it. Top-ups are added at once.
- **Granting:** only `activate_plan(user, plan, payment key)` grants anything. It runs as the service role and is idempotent on the payment key. The Phase 12 webhook will call it after verifying the provider's signature and amount. The app cannot call it.
- **Words in the app:** the app says "likes" ("3 likes left", "25 likes"). The spec and the legal drafts say "right swipes"; they are the same thing.
- **Plans screen:** one screen (`/paywall`) lists plans and top-ups; there is no separate top-up screen. Nothing is preselected and there are no "popular" badges or countdowns. It opens from the balance pill on Discover, from Settings, and when a like is refused.
- **Checkout:** `payments.checkout()` returns `unavailable` until Phase 12, and the screen says "Payments aren't open yet. Nothing was charged."

---

## Hardening of earlier phases (2026-09-28)

### D-043 Server-side photo intake
- **Problem:** photos were cleaned only on the device (crop, resize, re-encode), and the app wrote the published files itself. A tampered APK could publish a file with GPS EXIF, a non-image, or swap a registered photo for different bytes later.
- **Now:**
  - The app uploads into a private inbox bucket, `photo-uploads`. It holds JPEG only, 3 MB at most, only `{uid}/{id}.jpg` and `{uid}/{id}.tiny.jpg`, and at most 4 files waiting per account.
  - The `profile-photos` Edge Function checks the JPEG structure and reads the real size. It requires portrait 4:5 from 200 to 1080 px wide, and a tiny copy of at most 32 × 40 px.
  - It strips every metadata segment without re-encoding, so pixels are unchanged. It then writes the published copies itself, registers the photo and empties the inbox.
  - `add_profile_photo` and `remove_profile_photo` take the user id and run only as the service role. Clients have no write or delete access to `profile-photos` or `profile-photos-blurred`.
- **Outcomes the app shows:** `invalid_image` ("That file isn't a photo we can use"), `invalid_size`, `too_many_photos`, `last_photo`.
- **Not in scope here:** face, lighting and one-subject checks stay C-30. They plug into the same function (a low-confidence result sets the photo to `pending`) when the Phase 13 review queue exists.

### D-044 Edge Function gateway and CORS
- `verify_jwt = false` for every function. `requireUser` validates the token with Auth, which works with the new JWT signing keys, and preflights can reach the code.
- CORS allows any origin, because calls use bearer tokens, never cookies. The PWA can call functions from any Vercel preview URL.
- Service and publishable keys are read from `SUPABASE_SECRET_KEYS` / `SUPABASE_PUBLISHABLE_KEYS` when the platform provides them, else the legacy variables.

### D-045 No development status override
- The Phase 1 `EXPO_PUBLIC_DEV_STATUS_OVERRIDE` preview switch was removed. The app reads exactly three variables (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `APP_ENV`), and every route group needs a real server status. Local previews use the seeded local stack instead.

### D-046 Email + code is the only way in (auth hardening)
- **Found:** Supabase Auth also accepts password sign-ups, and email confirmations were off. Anyone with the public key could call `signUp` with any SRMIST address and a password. Tested on the local stack, this returned a session at once, and the server marked the email verified without any code. That was a full bypass of verification (D-027) and a way to pre-register someone else's address.
- **Now:**
  - Email confirmations are on (`config.toml`), so a password sign-up stays unconfirmed and gets no session.
  - A **custom access token hook** (`public.hook_custom_access_token`) refuses every token issued by a password sign-in, even for a confirmed account.
  - A trigger on `auth.users` refuses moving an account, or even requesting a move, to an email outside the allowed domains. A verified student cannot hand the account to a non-SRMIST address. A new SRMIST address still needs both inboxes to confirm.
- **Test users** (local scripts) sign in with a one-time token from an admin sign-in link; seed accounts have no password.
- **Cloud:** `supabase config push` sets confirmations and both hooks. Check them in the dashboard (SUPABASE.md).

---

## Phase 6 discovery (2026-09-27)

### D-042 Discovery rules (spec v2 sections 18 to 21)
- **Location-independent.** No geofence, radius or location of any kind (D-030).
- **Who appears:** eligible accounts only (the same rule as `get_my_status`, kept in step by a test), not blocked in either direction, **two-way gender compatibility** (each person's gender is in the other's "show me"), the viewer inside the **candidate's** age range (the candidate's wishes), and the candidate inside the **viewer's** age filter. The main photo must be approved.
- **Zodiac filter:** matches only people who show their zodiac; hidden signs never match, so a filter cannot be used to infer a hidden sign.
- **Private mode:** hidden from Discover **except to people they have liked** (they can still find someone they are interested in). Matches and chats are unaffected. The Privacy screen says so.
- **Anonymous mode:** the card has no name, and only the tiny blurred copies can be signed for others; the originals are refused by Storage.
- **Already decided:** liked profiles never return; passed profiles return after 30 days (`app_config.pass_cooldown_days`) **[DEFAULT, confirm]**.
- **Order (spec 21, "keep ranking simple"):** profiles completed in the last 7 days first, then a daily shuffle unique to each viewer (`md5(viewer, candidate, date)`). No attractiveness scores, no popularity.
- **Actions:** `swipe_right(target, idempotency_key)` records a like (a replay with the same key returns the first result) and `swipe_left(target)` records a pass; both re-check visibility on the server. Phase 7 adds swipe credits to `swipe_right` (charged only when the like is new); Phase 8 adds the match.
- **Photos of others:** Storage `select` policies call `private.can_view_photo_object`, which applies the same visibility rule, so a signed URL is issued only for an approved photo of someone the viewer may see. Nobody can list or sign photos otherwise.
- **No name search** (spec 19): no function accepts text; the feed only pages forward with an exclude list.
- **Filters** (spec 18): age range (18 to 60 in the app), "show me", zodiac. Nothing else.

---

## Phase 5 profile (2026-09-27)

### D-041 Profile rules (spec v2 sections 14 to 17, 20)
- **Required before the app opens:** at least one photo that is not rejected, a first name (1 to 30 characters), gender, "show me" (at least one), and the 30-character hook. About Me is optional (up to 1000). The server decides (`submit_profile()`); the app only mirrors the rule for instant feedback.
- **Gender:** Woman, Man, Non-binary (C-13). Gender is shown on the profile. "Show me" is private (`preferences.show_me`).
- **Photos:** up to 6 (`app_config.max_profile_photos`). The first is the main photo. The main photo prefers a fresh camera shot (front camera); the gallery is the fallback. Each photo is cropped to 4:5 and resized to at most 1080 × 1350 on the device, then re-encoded as JPEG, which also removes EXIF metadata including location.
- **Upload path:** files go to `profile-photos/{uid}/{id}.jpg` and a 24-pixel-wide copy to `profile-photos-blurred/{uid}/{id}.jpg`, both through owner-folder storage policies. `add_profile_photo()` registers a photo only if both objects exist in the caller's own folders and the limit allows it. Owners cannot insert or change photo rows or statuses directly.
- **Review:** `app_config.photo_review_required` (default **false** for the beta). When true, new photos stay `pending` until a moderator approves them (moderation tools arrive in Phase 15). Other users will only ever receive `approved` photos (Phase 6).
- **Anonymous mode:** the name is hidden and only the tiny blurred copies are served, so no detail can be recovered by the viewer. The copy is made on the device: a user who tampers with it can only expose their own photo. Age, verified badge, hook, About Me and zodiac (if on) still show (spec 20).
- **Private mode:** hidden from Discover; matches and chats keep working.
- **Zodiac:** derived from the private date of birth on the server, never stored or editable; shown only when the owner turns it on.
- **Discovery preferences** (`preferences.min_age` 18, `max_age` 30, `zodiac_filter`) exist now and get their UI in Phase 6. The 18 to 30 default range is **[DEFAULT, confirm]**.

---

## Platform and distribution amendment (2026-09-27): supersedes any "Android-only" statement

### D-035 Two initial platforms, one codebase
- **Android:** a native APK (Expo development and release builds), distributed directly from the SOUL website. Google Play is **not** required for V1.
- **iPhone:** an installable **PWA** (Safari, Add to Home Screen) built from the **same Expo Router codebase** via react-native-web. No App Store is needed for V1.
- **Future:** a native iOS build and a Play Store build stay possible without rewriting (same code, same backend).
- There is one Supabase backend: the same accounts, profiles, matches, chat, swipes, plans and badges on every platform.

### D-036 Platform services (adapters)
- Native-sensitive capabilities live behind interfaces in `src/services/<capability>/`: location, heading, camera, notifications, payments, secure-storage and device-integrity.
- Implementations use Metro platform extensions: `index.ts` is the native implementation (Android and future iOS) and `index.web.ts` the PWA one, both typed against the capability's `types.ts`. Screens import `@/services/<capability>` and never branch on `Platform.OS`.
- The web versions use capability detection. For example, heading reports `unavailable` instead of throwing, and Instant Meet degrades to distance, chat, timer and End Meet.

### D-037 Payments: SOUL-controlled web checkout (supersedes D-014 as the V1 path)
- `PaymentProvider` abstraction flow: checkout → provider → signed webhook → Edge Function verifies the signature and the amount against the server catalog → idempotent ledger or subscription grant → the client re-reads its entitlement. The client never grants anything.
- **CONFIG_REQUIRED (C-25):** payment provider and merchant account. Suitable Indian providers: Razorpay, Cashfree, PhonePe PG. Stripe India is limited. Development uses a mock provider that is refused in production.
- Google Play Billing and Apple IAP remain possible later adapters. If SOUL is later listed on Google Play, Play's payment policy for digital goods applies; that decision is deferred.

### D-038 Distribution website
- The web build is a single-page app (`web.output: 'single'`), so no account code runs at build time; the host rewrites unknown paths to `index.html`.
- `/download` reads `/downloads/latest.json` (version, URL, SHA-256, size), a static file the release step writes next to the APK, so the page needs no account or backend.
- Routes on the web build: `/` is the app (the Welcome screen when signed out), `/download` is the Android APK download and install steps, and `/install` covers opening SOUL on iPhone (Add to Home Screen guide).
- The Welcome screen in a browser detects the platform and offers "Download for Android" on Android browsers, or the iPhone install hint in iOS Safari when not already installed.
- **CONFIG_REQUIRED (C-26):** web hosting and a domain for the PWA and the APK download (HTTPS is required for the PWA, geolocation and service worker).

### D-039 Android updates without Play
- `app_config.android_release` holds `{ latest_version, min_supported_version, apk_url, sha256 }`. The app checks it and shows an update prompt (forced only below the minimum).
- The APK is downloaded from the SOUL site over HTTPS with its SHA-256 published. The signing key must never change between versions (C-20).
- Over-the-air JS updates (expo-updates / EAS Update) are optional later (needs an EAS account).

### D-040 Web session and offline policy
- **Session storage:** on the web, the Supabase session uses `localStorage`; browsers have no keystore equivalent. Mitigations: a strict Content-Security-Policy, no third-party scripts, and short-lived access tokens with refresh.
- **Service worker:** caches only the static app shell (JS, CSS, fonts, icons, logo). It **never** caches API responses, messages, profile photos, location or auth traffic. Offline shows the offline state.

---

## Final specification v2 and owner rules (2026-09-27): these supersede earlier entries

The final master specification (v2) and the owner's direct instructions in the same message change the following. Where the pasted spec and the owner's own words differ, the owner's words win.

### D-027 Verification = SRMIST email + OTP only (owner rule; supersedes D-009)
- The **only** verification is ownership of an allowlisted institutional mailbox (`@srmist.edu.in`), proven by an emailed 6-digit OTP.
- No student ID capture, no liveness selfie, no face match, no identity or document vendor (no SheerID or similar). The `verification-private` bucket stays unused and is removed with the Phase 4 migration.
- The domain allowlist is server-side (`app_config.allowed_email_domains`). A Supabase Auth *before-user-created* hook rejects any other domain, so non-SRMIST addresses can never create an account, whatever the client does. More domains can be added without shipping an APK.
- The public "Verified" indicator means **verified SRMIST email**.

### D-028 Age like other dating apps (owner rule; supersedes the age parts of D-009)
- The user enters their date of birth once; the server requires 18+. Under-18 entries are refused and locked out of re-entry (no DOB stored for them).
- The date of birth is stored privately and never shown; the public profile shows age only. Zodiac is derived from the date of birth on the server (spec 17).

### D-029 Rules must be ticked first (owner rule)
- Before entering their SRMIST email, the user must tick every item: community rules, Terms, Privacy Policy, "I am 18 or older" and "I am a current SRMIST student".
- After OTP, the app records the accepted `terms_version` server-side. The server requires the current version before the account is eligible.
- **CONFIG_REQUIRED (C-23):** the final Terms of Service, Privacy Policy and Community Guidelines texts need owner and legal review. Development builds show clearly marked drafts.

### D-030 No geofence; location only for Instant Meet (spec v2 section 2; supersedes D-010)
- Normal SOUL (auth, discovery, likes, chat) works from anywhere. There are no approved zones or campus polygons, and nothing is location-constrained outside Instant Meet. `approved_zones` is dropped in the Phase 4 migration.
- The app never requests location except when the user opens and enables Instant Meet.

### D-031 Instant Meet radius = 1 km (spec v2 sections 27 to 33; refines D-011)
- Candidates are Instant-active, entitled, compatible, not blocked, and within **1 km** by server-side PostGIS `ST_DWithin` on `geography`. Someone 1.4 km away is never a candidate.
- Everything else in D-011 stands: mutual accept before any proximity, bucketed distances, and below 100 m only "<100 m, You're nearby".
- Location updates are adaptive for walking pace. Instant location is deleted when the session ends; only the minimum abuse and security record is kept.

### D-032 Profile photo requirement without identity checks
- At least one clear face photo is still required to use SOUL (spec 14), but it is profile content, not identity verification. It goes through basic automated checks (a face is present) plus report-driven moderation. There is no face-to-identity matching.

### D-033 Free swipes: configurable, owner's current value one-time
- The pasted pricing lists the free reset cadence as undecided, while the owner answered directly "no resets, they have to buy swipes again". Both are satisfied by making it server config: `app_config.free_right_swipes = { quantity: 4, resets: false }`, which can change without an APK. The monthly (₹199) plan includes **25 right swipes per month** (owner, 2026-09-27).

### D-034 Accent colour vs spec v2 (closed 2026-09-27: owner keeps the accent, C-24)
- Spec v2 section 6 says monochrome with no pink or red. The owner earlier chose "Add one romantic accent" (D-026). Until the owner confirms, **D-026 stays in code**; it is two tokens and reversible in minutes.

### Phase renumbering (spec v2)
There is no separate geolocation phase. See `PHASE_PLAN.md`.

---


## D-001 Platform and framework (accepted)

- Expo SDK 57, the latest stable as of 2026-09-27 (`expo@57.0.25`). React Native comes from the SDK pairing (0.86 per the Expo docs). The New Architecture is mandatory.
- TypeScript in strict mode. Expo Router with file-based routes.
- **Development builds** (`npx expo run:android`, or `expo-dev-client`). The app is never designed around Expo Go.
- Android is the source of truth: compile/target SDK 36, minimum Android 7+ per the SDK 57 defaults. ~~Web is not a target for V1.~~ **Superseded by D-035:** the web build is the iPhone PWA.
- Packages are added with `npx expo install` so versions match the SDK.
- Local Android builds use Gradle directly. EAS is optional and not required for an installable APK.

## D-002 Repository layout (accepted)

The spec's feature-oriented structure is combined with the Expo rule that `src/app` holds routes only (skill: `expo-project-structure`).

```
src/app/            routes only (Expo Router); each route renders a feature screen
src/features/<domain>/{screens,components,api,hooks,model}
src/components/     shared primitives (SoulButton, SoulText, …)
src/theme/          tokens: color, type, spacing, radii, borders, motion, layers, sizes, icons
src/lib/            supabase client, query client, env, logger, errors
src/services/       device services (location, heading, secure storage, notifications)
src/stores/         small client-state stores, split by change frequency
src/types/          generated DB types + shared types
src/utils/          pure helpers, tests colocated
assets/{brand,fonts,images}
supabase/{migrations,functions,seed,tests}
docs/               long-form docs, with the required top-level docs kept at the root
skills/             exported skill reference copies (not app code)
```

`receipts/` and `review-receipts/` at the root are artifacts from local Claude plugins, not part of SOUL. They are git-ignored.

## D-003 Styling system (accepted)

- Plain `StyleSheet` plus a typed token module in `src/theme`. No NativeWind or Tailwind layer.
- Why: SOUL's palette is tiny (monochrome) and the spec demands centralized tokens. A typed token module gives compile-time safety with no extra build step or dependency surface.
- Screens never contain literal hex colours, font sizes, or spacing numbers. They reference tokens only (enforced by a lint rule and the mobile-taste grep checklist).

## D-004 Design dials and chrome (accepted)

From the `mobile-taste` App Read (see `MOBILE-DESIGN.md`):

- `DESIGN_EXPRESSION 7`: branded, premium, monochrome. The content is custom.
- `MOTION_INTENSITY 6`: motion quality is a core product requirement (swipe, sheets, composer, compass), but restrained.
- `VISUAL_DENSITY 2`: spacious, generous breathing room.

Because expression is below 8, **navigation chrome stays native** (Expo Router tabs and native stack headers), styled with tokens and brand fonts. SOUL does not hand-paint its own tab bar.

## D-005 Client data and state (accepted)

- Server state: TanStack Query (caching, retries, offline pause/resume).
- Client state: small, separate Zustand stores (session, UI preferences, instant-session UI). There is no single global store.
- Validation: Zod on every inbound network payload and form. Edge Functions validate with Zod too.
- Lists: FlashList v2 for chats and messages. `expo-image` for all photos (caching, blurhash placeholders, recycling keys).
- Keyboard: `react-native-keyboard-controller`, which drives the floating composer on the UI thread.
- Motion: `react-native-reanimated` 4.5.1 (plus `react-native-worklets` 0.10.1) and `react-native-gesture-handler` 2.32, the versions paired with SDK 57 by `create-expo-app` and `npx expo install`. npm's newest releases (Gesture Handler 3.x, Reanimated 4.7) are **not** SDK 57's pairing and are not used. Read the docs for these exact versions (Gesture Handler **2.x** API) for every gesture and animation (see `skills/SOUL_SKILL_MAP.md`).
- Sheets: evaluate `@expo/ui` BottomSheet first (skill rule). If it cannot meet SOUL's spring feel or content needs on Android, fall back to `@gorhom/bottom-sheet`. Decided in Phase 2 against a rendered prototype.

## D-006 Session storage (accepted)

- The Supabase session is persisted directly in `expo-secure-store` (Keystore-backed encrypted storage on Android, excluded from Auto Backup by the config plugin). The SDK 57 docs confirm Expo enforces no size limit; only older iOS releases rejected values above about 2 KB. If iOS ever becomes a target, switch to a chunked or encrypted-blob adapter. `android.allowBackup` is also `false`.
- The APK only ever contains the Supabase URL and the publishable (anon) key. Service-role and other secrets exist only as Edge Function secrets.

## D-007 Backend (accepted)

- Supabase only: Auth, Postgres with PostGIS, Storage, Realtime, Edge Functions (Deno), `pg_cron`.
- No NestJS or Fastify service unless a demonstrated need appears. Any exception gets its own decision entry.
- Schema changes go only through versioned migrations in `supabase/migrations`. Nobody edits a production schema by hand.
- Local development uses the Supabase CLI with Docker. Dev and prod are separate Supabase projects.

## D-008 Authentication (accepted)

- Supabase Auth **email OTP** (a 6-digit code, not magic links, so the flow stays inside the app).
- The email domain must be on a server-side allowlist. Enforcement runs in the server at sign-up (an Auth hook or a guarded Edge Function), not in the client.
- The allowlist initially contains `srmist.edu.in` (SRMIST student NetID mail on Google Workspace). **CONFIG_REQUIRED: confirm** whether any other domains qualify.
- Anti-enumeration: the same response is returned whether or not an account exists. OTP sends and verifies are rate limited per email, device, and IP (see SECURITY_MODEL).

## D-009 Verification architecture (**superseded by D-027 and D-028**)

Verification is layered. Each step records a server-side status. The client never sets any status.

1. SRM email: the OTP proves control of an `@srmist.edu.in` mailbox.
2. Student identity: an SRM ID card capture. The registration number is stored encrypted, plus a keyed hash for duplicate detection. It is never public.
3. Age: a government ID or a verified date-of-birth source. **CONFIG_REQUIRED:** which documents are acceptable, since the SRM ID card may not show date of birth.
4. Liveness selfie.
5. Face-to-ID match.
6. Primary photo validation: one clear face, matching the verified selfie.

- Implementation: a `VerificationProvider` interface in Edge Functions. Providers are `manual` (a human review queue, available from day one), `vendor` (an identity-verification SDK and API, **CONFIG_REQUIRED**: choice of vendor and account), and `dev_fixture` (only where `APP_ENV=development` **and** a server-side flag is on; unreachable in production builds).
- Until a vendor is contracted, every identity step routes to manual review. This is slower but production-safe.
- Low automated confidence always routes to manual review. Automatic filter or manipulation detection is treated as a signal, never as infallible.
- Raw identity documents and selfies live in a restricted bucket and are deleted after the decision plus an appeal window (**CONFIG_REQUIRED**: retention days, proposed 30). Only derived claims are kept: verified date of birth, method, reviewer, timestamps.

## D-010 Location and geofences (**superseded by D-030: no geofence**)

- Approved zones are PostGIS polygons (`geography(MultiPolygon)`) in `approved_zones`, managed by admins: enabled flag, label, zone type. There is **no radius-based eligibility**.
- The client sends a foreground location fix (latitude, longitude, accuracy, timestamp, mock flag) to a server function. The server decides inside, outside, or unverifiable and returns only that state and a coarse zone label.
- For normal discovery, **raw coordinates are not persisted**. The server keeps only eligibility, zone, and expiry (proposed TTL 30 minutes, then a re-check).
- There is no background location tracking. Location is requested only when the user uses Discover or Instant, never at cold start.
- Seed polygons for SRM campus, Potheri, Estancia and Abode are **development approximations only**. **CONFIG_REQUIRED**: real polygons, reviewed by an admin, before production.

## D-011 Instant Meet proximity (accepted; radius locked at 1 km by D-031)

- Candidate search runs only for users who opted in, are eligible, are entitled by plan, and are not blocked or suspended. Proximity data flows **only after both users accept**.
- During an active session, each device posts its location to a server function about every 5 seconds (configurable). The latest fix sits in `private_location_state`, which no client can read under RLS. It is deleted when the session ends.
- The server computes geodesic distance (`ST_Distance` on geography) and absolute bearing (`ST_Azimuth`). It returns only a **bucketed distance** (~50 m steps below 1 km, ~100 m steps above; `<100 m` shows as "You're nearby") and a **quantized bearing** (15° sectors).
- The client combines that bearing with its own device heading to draw the relative arrow. Raw coordinates of the other person never reach the client.
- Below 100 m, the direction arrow is suppressed. The UI shows "You're nearby" only, so the feature cannot act as a tracking radar.
- Once a public meeting point is agreed, guidance switches to the meeting point instead of the other person.
- End Meet by either user is unilateral: the session is revoked, the channel closed, and location rows deleted, all in one server transaction.

## D-012 Realtime (accepted)

- Supabase Realtime **private channels with Realtime Authorization** (RLS on `realtime.messages`), not unrestricted Postgres Changes.
- Messages are persisted first, then a database trigger broadcasts to the conversation topic. Typing indicators use Presence or Broadcast on the same authorized topic.
- Channel authorization re-checks match and block status. On block or unmatch, the server removes membership, broadcasts a revoke event, and clients unsubscribe. Joins are re-authorized on token refresh. The small window before a client obeys a revoke event is documented in SECURITY_MODEL.

## D-013 Swipe credits and entitlements (accepted)

- Plans, prices, quotas, periods and Instant inclusion live **only** in the server tables `plans` and `plan_entitlements`. The UI renders whatever the server returns.
- `swipe_credit_ledger` is append-only, with entries `grant`, `consume`, `refund`, `reverse` and `expire`. Each entry has a source bucket (`free`, `plan`, `topup`), a unique idempotency key and a reference to its purchase or like.
- The balance is always computed on the server.
- A right swipe is one SECURITY DEFINER function transaction that locks the user's entitlement row, inserts the like (unique per pair), consumes one credit only if the like is new, and creates the match if reciprocal. Replays with the same idempotency key return the original result without charging again.
- Bucket consumption order: the lot that expires soonest first, so plan, then free, then top-up (settled in D-047).
- Passes are not metered.

Known values:

| Item | Price | Right swipes | Instant |
|---|---|---|---|
| Free | - | 4, **one-time per account, never resets** (C-10) | no |
| Weekly | ₹69 / week | 15 per weekly period | no |
| Monthly | ₹199 / month | **25 per monthly period** (owner, 2026-09-27) | yes |
| 3 months | ₹249 | 50 for the plan entitlement | yes |
| 6 months | ₹499 | 120 for the plan entitlement | yes |
| Top-up | ₹50 | 5 | no |
| Top-up | ₹100 | 12 | no |
| Top-up | ₹200 | 25 | no |

Open values are listed under Unresolved configuration below.

## D-014 Billing (accepted)

- A `BillingProvider` interface exists on the client, with server-side verification for every purchase.
- The `test` provider is only compiled in and enabled for development builds. It calls a dev-only grant function that refuses to run in production.
- The production Android provider is Google Play Billing, **Play Billing Library 8 or later**. Version 8 has been required for new apps and updates since 2026-08-31 (extension to 2026-11-01), and version 9 will be required by 2028-08-31. The library choice (`expo-iap` or `react-native-iap`) is made in Phase 13 after confirming each one's bundled PBL version.
- Plans map to Play subscriptions (weekly, monthly, 3-month and 6-month base plans). Top-ups map to consumable in-app products.
- Server verification uses the Google Play Developer API. Real-time developer notifications arrive via Cloud Pub/Sub, pushed to an Edge Function. Acknowledgement and consumption happen server-side after the grant is recorded.
- Refunds and revocations append `reverse` ledger entries.
- The client shows store-localized prices from the billing library, falling back to the server catalog in development.

## D-015 Matching (accepted)

`likes` has a unique `(liker, likee)`. `matches` has a unique ordered pair `(least(a,b), greatest(a,b))`. Matches are created only inside the like transaction under a pair-scoped advisory lock. Unmatching sets the match inactive and closes the conversation; it does not hard-delete, so moderation evidence survives.

## D-016 Privacy modes (default, confirm)

- **Normal:** eligible discovery.
- **Private (hide until match):** the user is shown only to people they have already liked. Their own like makes them visible to that person, so matching still works. They never appear in general discovery.
- **Anonymous:** the user appears in discovery with the primary photo replaced by a **server-generated blurred derivative**. The original is not downloadable, and only age, verified indicator, zodiac (if enabled), hook and About Me are shown. After a mutual match, the photos reveal according to the user's reveal setting. Anonymous still requires full private verification.
- Private and anonymous can be combined.

## D-017 Date confirmation and Hot Person (default, confirm)

- After a match, each user can privately answer "Did you meet?". A date event is created only when **both** answer yes within the confirmation window. Neither sees the other's answer before answering.
- At most one qualifying date is created per match per confirmation round. A new round opens only after a cooldown (proposed 24 h, configurable).
- **Anti-farming proposal [DEFAULT, confirm]:** only one date per distinct partner counts toward the rolling 30-day window, so three dates with the same person do not earn the badge on their own. This is interpretation, not a stated product rule, so it needs owner confirmation.
- The badge is active when qualifying dates in the last 30 days are 3 or more. It is recomputed on confirmation and by a `pg_cron` job. Only a boolean is ever public; the count is visible only to its owner.

## D-018 Push notifications (open)

`expo-notifications` on Android needs Firebase Cloud Messaging credentials, either through the Expo Push Service (needs an Expo account and project ID) or through direct FCM HTTP v1 from Edge Functions (needs a Firebase service account). Decided in Phase 15. Both need owner action.

## D-019 Admin and moderation surface (open)

All moderation actions are server-side functions that check a server-held `admin_roles` table. No admin power relies on a hidden route. The admin UI (a separate internal web app versus a role-gated app section) is decided in Phase 16.

## D-020 Analytics (accepted)

No third-party analytics in V1. If added later, only the anonymous operational events allowed by spec section 58, with none of the forbidden payloads.

## D-021 Typography (accepted, 2026-09-27; owner reconfirmed "fonts of your choice" after spec v2)

- Font tokens are named by role: `body` (UI and body text) and `display` (titles, section headings, editorial moments). Screens never name a font file.
- **Aprila and Carcade are not used.** Free copies of Aprila are personal-use only, and the Dealjumbo edition is a 1960s swash display face unsuited to body text. "Carcade" matches no known typeface; the closest, Din Studio's *Carade*, is also personal-use only. Commercial app embedding would need paid licences, which the owner has not bought. The owner granted freedom to choose the best alternatives (2026-09-27).
- **body = Alegreya Sans** (SIL OFL 1.1, v2.004, Huerta Tipográfica): Regular 400, Medium 500, Bold 700 (the family has no 600, so button labels use Bold). It has the `₹` glyph and tabular figures (`tnum`). **Owner's choice, 2026-09-27**, after asking for an informal feel: Schibsted Grotesk looked "normal" and Plus Jakarta Sans looked "formal". Its x-height (0.46 em) is small, so body roles are 1 px larger than before (body 18/26). Instrument Sans, Outfit, Sora and others were excluded earlier for lacking `₹`.
- **display = Instrument Serif** (SIL OFL 1.1): Regular and Italic. It has no `₹`, so prices always use the body font.
- The files are in `assets/fonts/` with their licences in `assets/fonts/licenses/`, from the Google Fonts repository (`google/fonts`, `ofl/`) or the Expo-maintained `@expo-google-fonts` packages. They are embedded at build time with the `expo-font` config plugin (no runtime loading, no font-swap flash).
- If the owner later licenses Aprila or Carade for app embedding, swapping them in only changes `src/theme/typography.ts` and the font plugin entry.

## D-022 Logo handling (accepted, updated 2026-09-27)

- **Originals (never modified):**
  - `assets/brand/soul-logo-original.jpg`: first supplied copy, 736×810, SHA-256 `33ed67b0…c1049f5462`.
  - `assets/brand/soul-logo-original-hires.jpg`: the highest-resolution copy of the same image, 1652×1820 with the mark at 734×295. It was downloaded at the owner's request from `i.pinimg.com/originals/...` (Pinterest pin 321092648412178656). SHA-256 `b166e388…1898c7b1`.
- **Derivatives** (`assets/brand/derived/`), made from the hi-res original only by non-destructive steps: crop to the mark plus an 8 px margin, luminance-to-alpha (≥245 transparent, ≤20 opaque), and removal of isolated paper-texture specks away from the mark. The antialiased edges of the mark are unchanged.
  - `soul-logo-black.png`: black mark for white surfaces.
  - `soul-logo-white.png`: white mark for black surfaces (owner-approved, 2026-09-27: "yes, vice versa").
- Maximum crisp display width is about 180 dp at xxxhdpi (734 px ÷ 4). The splash uses 160 dp.
- **Rights (release blocker, C-22):** the pin is marked "Uploaded by user" with the title "Soul - Gentle Math", and no creator or source link is given. It appears to be a third-party design. Before public release the owner must confirm SOUL owns or has licensed this logo (copyright and trademark).

## D-023 Device trust (accepted)

Risk signals feed a `risk_signals` table and a manual review queue: GPS accuracy, the Android mock-location flag, impossible travel, abnormal jumps, Play Integrity verdicts, rooted or emulated device hints, and repeat reports. No single weak signal bans anyone. Play Integrity needs Play Console and Google Cloud setup (owner action, Phase 14).

## D-024 Testing stack (default, confirm)

Jest with React Native Testing Library for units and components. pgTAP via `supabase test db` for RLS, constraints and races. Deno tests for Edge Functions. An on-device E2E tool (Maestro is the candidate, pending a Windows toolchain check) for Android flows in Phase 17. Test identities are `User A`, `User B`, `Test User 01` and so on, never human names.

## D-025 Light and dark appearance (default, confirm)

With the white logo approved, SOUL follows the Android system appearance: a light theme (white surfaces, black type, black mark) and a dark theme (black surfaces, white type, white mark). Both are monochrome and built from the same semantic tokens; the splash has a dark variant. If the owner prefers a single fixed appearance, set `userInterfaceStyle` in `app.config.ts`. No component changes are needed.

## D-026 One romantic accent (accepted, owner decision 2026-09-27)

The owner felt the strict monochrome direction read "too X" (too much like a social network) and chose to **add one romantic accent**. This changes spec section 5 by owner decision.

- Light appearance: deep wine `#8C1D35` (8.97:1 on white; white icons and text on it pass AA).
- Dark appearance and black moments: rose `#E0708A` (6.85:1 on black; near-black text on it is 6.46:1).
- **Used only for** the like action, the match reveal, and heart moments. **Never** for general buttons, links, badges (Verified and Hot Person stay monochrome), backgrounds, gradients or decoration.
- It is never the only state indicator: likes and matches also carry an icon and text.
- The rest of SOUL stays black, white and neutral greys. Dating warmth also comes from photography first, italic serif moments, black welcome and match screens, and intimate copy.

---

## Unresolved configuration (tracked until closed)

| ID | Item | Blocks | Default until set |
|---|---|---|---|
| C-01 | ~~Aprila and Carcade font files~~ **closed 2026-09-27**: OFL Alegreya Sans (owner's choice; earlier Schibsted Grotesk, then Plus Jakarta Sans) + Instrument Serif (D-021) | - | - |
| C-02 | ~~High-resolution logo~~ **closed 2026-09-27**: 1652×1820 original obtained (D-022). A vector would still be better for the launcher icon | - | - |
| C-03 | ~~White logo variant~~ **closed 2026-09-27**: approved, derived (D-022) | - | - |
| C-04 | ~~Android `applicationId`~~ **closed 2026-09-27**: **`com.soul.srm`**, locked for Android, the future iOS bundle id, the deep-link scheme, notifications and distribution. Never renamed after the public beta without explicit owner approval | - | - |
| C-05 | Email domain allowlist beyond `srmist.edu.in` | Phase 4 launch | `srmist.edu.in` only |
| C-06 | ~~Acceptable age documents~~ **closed**: self-declared DOB, 18+ enforced by the server (D-028) | - | - |
| C-07 | ~~Identity-verification vendor~~ **closed**: none, email + OTP only (D-027) | - | - |
| C-08 | ~~Verification document retention~~ **closed**: no documents are collected (D-027) | - | - |
| C-09 | ~~Geofence polygons~~ **closed**: no geofence (D-030) | - | - |
| C-10 | ~~Free right-swipe reset cadence~~ **closed 2026-09-27**: **no reset**. The 4 free right swipes are a one-time grant per account. After that, users buy a plan or top-ups | - | - |
| C-11 | ~~Monthly plan included right swipes~~ **closed 2026-09-27**: **25 right swipes per month** (owner) | - | - |
| C-12 | ~~Plan swipe rollover / top-up expiry~~ **closed 2026-09-27**: unused plan swipes end with the plan period (no rollover); top-ups never expire (owner: "same like any other") | - | - |
| C-13 | ~~Gender options~~ **closed 2026-09-27**: Woman / Man / Non-binary; "show me" any combination (owner: ok) | - | - |
| C-14 | Hot Person anti-farming rule (distinct partners) | Phase 12 release | D-017 proposal |
| C-15 | ~~Google Play Console / Play Billing~~ **deferred**: V1 uses web checkout (D-037) | - | - |
| C-16 | Push credentials. Android: Firebase Cloud Messaging (works for APKs outside Play); owner creates the Firebase project, Android app `com.soul.srm`, `google-services.json` and a service account key (BUILD_ANDROID.md). iPhone PWA: standards Web Push, no Apple account; VAPID keys generated for the project. Push is never required for chat or matching | Phase 14 (push only) | In-app realtime only |
| C-17 | ~~Supabase projects~~ **closed 2026-09-27**: cloud project `bdwuhrkgrwzpwqhgsngi` for beta/production (URL + publishable key in `.env.production`, git-ignored); local Docker for development. Schema not yet pushed: needs the owner's `supabase login` and DB password (SUPABASE.md) | - | - |
| C-18 | Message handling on account deletion | Phase 14 | Deleted user's message bodies purged; counterpart sees "Message removed" |
| C-19 | ~~Read receipts default~~ **built 2026-10-02 (D-049)**: on by default, mutual, switch in Privacy. The owner can still ask for off by default | - | - |
| C-20 | Production release keystore for `com.soul.srm`: generated **only** when release signing is needed, after the owner sees the exact command (BUILD_ANDROID.md "Signing"). Never committed; passwords only in local secure config; debug builds use the separate debug key; every production APK uses the same identity | First release APK (Phase 20) | Debug key for dev builds; release builds fail without the production key |
| C-21 | **RELEASE_BLOCKER.** Compact app-icon mark: the wide wordmark is never squeezed into the launcher icon (full logo = splash/branding; compact mark = app icon). The final mark needs an owner-approved original or licensed asset | **Public release** | Temporary monochrome placeholder (white ring on black, `scripts/make-placeholder-icons.py`) for Android and the PWA |
| C-22 | ~~Logo licensing~~ **closed 2026-09-27 by owner statement**: the owner states the logo (from a Pinterest pin) is free for public use and grants full permission to use it; no need to hide it. Recommended: keep a saved copy of the source page or licence note as proof. (The separate compact app-icon mark, C-21, stays a release blocker) | - | - |
| C-23 | Legal texts: eight drafts written 2026-09-27 (community and safety rules, Terms, Privacy, 18+ eligibility, verification and photo checks, Instant Meet and location, subscriptions/top-ups/refunds, deletion and retention) in `src/features/auth/legal/documents.ts`, labelled "DRAFT — REQUIRES FINAL HUMAN/LEGAL REVIEW", with bracketed placeholders (operator name, address, contacts, Grievance Officer, city, retention days, tax wording). Engineering is not blocked | **Public release** | Drafts shown in app and on the website |
| C-24 | ~~Accent colour~~ **closed 2026-09-27**: keep wine/rose for like, match and hearts only (D-026); everything else monochrome | - | - |
| C-25 | Payment provider: **Razorpay** (owner, 2026-09-27). Needed from the owner in Phase 12: Razorpay **test** key id + key secret and a webhook secret, set as server secrets (never in chat or the app); live keys and merchant KYC before paid launch | Phase 12 (test keys); paid launch (live) | Mock provider in development only |
| C-26 | ~~Hosting~~ **closed 2026-09-27**: free Vercel hosting with the generated `*.vercel.app` domain for development and beta. A custom domain is optional and never blocks any phase | - | - |
| C-27 | Plan renewal: whether plans renew automatically (Razorpay subscriptions) or are bought one period at a time | Phase 12 | One period at a time, no auto-renewal **[DEFAULT, confirm]** (the purchases draft says so, marked "to confirm") |
| C-28 | Email sender for OTP codes on the cloud project (custom SMTP). Supabase's built-in email reaches only project team members | **Before real students sign in** | Suggested without a domain: a dedicated SOUL Gmail account with an app password (SUPABASE.md); the owner enters it in the dashboard |
| C-29 | Retention periods and legal placeholders in the drafts: deleted-data purge (proposed 30 days + 30 for backups), safety records (12 months, email fingerprint only), Instant Meet session records (90 days), refund timing (5 to 7 working days) | Legal review | Proposed values in the drafts |
| C-30 | Automated photo checks (spec 14: visible face, lighting, one subject, no photo of a screen, no heavy manipulation). **Server intake built (D-043):** real-JPEG check, real size, metadata stripped, server-written copies. Still open: the face/lighting/subject checks, planned for Phase 13 inside the `profile-photos` function, with low-confidence photos going to `pending` for the Phase 15 review queue. Until then photos are approved on upload (review flag off) and moderated after reports. Options: on-device face detection as a hint only (the app is untrusted), or server-side detection. Never identity matching (D-027, D-032) | Before public launch | Report-driven review; review flag available |
