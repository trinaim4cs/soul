# SOUL: Phase Plan

A phase is complete only when its exit checks pass at the appropriate level (typecheck, lint, tests, running on Android, visual inspection where relevant). Status: `todo` · `in progress` · `done` · `blocked (reason)`.

Skills per phase come from `skills/SOUL_SKILL_MAP.md`. `soul-audit` is enabled only for Phases 18 and 19 (spec v2 numbering).

| # | Phase (spec v2 numbering) | Status |
|---|---|---|
| 0 | Audit / plan | done (re-audited for spec v2 and the platform amendment) |
| 1 | Foundation | done on Android; web target added by phase P |
| 2 | Brand + design system | done on Android; web fonts and icons added by phase P |
| 3 | Supabase foundation | done |
| 4 | SRMIST auth (rules → email → OTP → 18+) | done (Android + iPhone-size web verified) |
| P | Platform amendment: web/PWA target, service adapters, icon font, `/download` + `/install` | done |
| 5 | Profile | done (Android emulator + iPhone-size web) |
| 6 | Discovery (location-independent) | built; web + Android verified; Android icon-font rebuild pending |
| 7 | Swipes + plans | todo |
| 8 | Matching | todo |
| 9 | Chat | todo |
| 10 | Instant Meet (the only location feature, 1 km) | todo |
| 11 | Date confirmation + Hot Person | todo |
| 12 | Billing (SOUL web checkout, D-037) | todo |
| 13 | Safety + moderation | todo |
| 14 | Push (FCM + Web Push) | todo |
| 15 | Admin | todo |
| 16 | Testing (incl. the cross-platform matrix in `PLATFORM_MATRIX.md`) | todo |
| 17 | Visual QA (Android + iPhone-size web) | todo |
| 18 | Security audit | todo |
| 19 | Performance | todo |
| 20 | APK + website (`/download`, `/install`, PWA deploy) | todo |

**Spec v2 (2026-09-27) changes to scope:**
- Verification is SRMIST email + OTP only, and age is a self-declared DOB with 18+ enforced by the server (D-027, D-028).
- The rules checkbox screen comes first (D-029).
- There is no geofence; the old Phase 6 "Geolocation" is removed and location exists only in Instant Meet at 1 km (D-030, D-031).
- The old per-phase plans below are kept for history; where they mention student ID, selfie, face match, zones or geofences, those parts are void.

**Platform amendment (2026-09-27) changes to scope (D-035 to D-040):**
- Two platforms from one codebase: the Android APK (direct download from the SOUL site, no Play Store) and the iPhone PWA (Safari, Add to Home Screen). Native iOS stays possible later.
- Phase P adds what Phases 1 and 2 would have included: the web target, web font and icon loading, the PWA manifest and app-shell service worker, the `src/services/*` adapters, and the `/download` and `/install` routes.
- **Exit rule for every phase from 4 on:** verified on the Android emulator **and** in an iPhone-size web viewport (390 × 844), plus the relevant rows of the cross-platform matrix in `PLATFORM_MATRIX.md`.
- Billing is SOUL web checkout with a provider webhook and a server entitlement (D-037); Play Billing is deferred (C-15). The old Phase 13 billing plan below is void where it mentions Play.
- The APK phase also ships the website (`/download` with the SHA-256, `/install`) and the PWA deploy (host and domain: C-26).
---

## Phase 0: Audit / plan (done, 2026-09-27)

**Objective:** understand everything before code.

**Inspected:**
- **Repo:** empty apart from `assets/`, `skills/` (exported skill references), and the plugin artifact folders `receipts/` and `review-receipts/`. Not a git repo yet.
- **Skills:** `expo-overview`, `expo-project-structure` and `mobile-taste` were loaded and applied (App Read, Nav Read, dials, folder layout). The SDK version facts came from the mobile-taste versions file plus npm.
- **Logo:** 736×810 JPEG, mark 327×131 px, black on a lightly textured white background. The pristine copy and a transparent derivative were made (D-022). Resolution is too low for the splash and launcher icon (C-02).
- **Fonts:** **Aprila and Carcade not supplied** (C-01). The dev fallback is D-021.
- **Toolchain:** Node 24.14, npm 11.17, Git 2.53. JDK 17 (Adoptium) and Android Studio JBR are available; JAVA_HOME points at JDK 25, which Android builds must not use. Android SDK platforms 34, 36 and 36.1 with build-tools up to 37 and `adb` 1.0.41 are installed. **No AVD, no NDK yet.** Docker 29.6 is installed but the daemon is not running.
- **Versions (npm, 2026-09-27):** expo 57.0.25, expo-router 57.0.23, react-native-reanimated 4.7.0, react-native-gesture-handler 3.3.0, @supabase/supabase-js 2.117.2, supabase CLI 2.118.0, @expo/ui 57.0.20.
- **Platform facts:** Play Billing Library 8 or later has been required since 2026-08-31 (extension to 2026-11-01). SRMIST student email is `NetID@srmist.edu.in`.

**Outputs:** `ARCHITECTURE.md`, `DECISIONS.md` (D-001 to D-024, plus unresolved config C-01 to C-21), `SECURITY_MODEL.md`, `MOBILE-DESIGN.md`, this plan.

---

## Phase 1: Foundation (done, 2026-09-27)

**Result:** Expo SDK 57 app in `D:\SOUL` (RN 0.86.3, Reanimated 4.5.1, Gesture Handler 2.32). Strict TypeScript, ESLint (with a hex-literal guard), Prettier and Jest are set up. `app.config.ts` separates dev and prod: the production applicationId must be supplied explicitly, and `allowBackup` is off. The Zod-validated env, the Supabase client (session in SecureStore), the TanStack Query client, the root error boundary and the splash-gated bootstrap are in place. Route groups `(auth)`, `(onboarding)` and `(app)/(tabs)` are guarded by `Stack.Protected` from the account status; the server wiring comes in Phase 3. Git is initialized with no commits.

**Verified on the emulator** (AVD `soul_pixel_api36`, Android 36, x86_64 debug build): the signed-out route renders Welcome, and the four-tab NativeTabs shell renders with monochrome chrome and Schibsted Grotesk labels (via the dev status override). Typecheck, lint and 6 unit tests are green.

**Watch item:** one native SIGSEGV (`MountingCoordinator::pullTransaction`) occurred once while the dev client reloaded during a Metro restart. It did not reproduce in 3 cold launches of the same code. It is treated as a dev-reload race and gets re-checked on release builds in Phase 20.

### Original plan

**Objective:** a strict-TypeScript Expo Router app that builds and runs on Android as a development build.

**Skills:** expo-overview, expo-project-structure, expo-router, expo-dev-client, react-native-patterns, verification-loop.

**Work:**
- Scaffold (`create-expo-app`, SDK 57) into the root. Move to `src/app`. TypeScript strict, `@/*` alias.
- `app.config.ts` with `APP_ENV` (development/production), dev placeholder `applicationId` `app.soul.dev` (C-04), scheme `soul`, portrait orientation, and no location/camera permissions yet (they are added in their own phases).
- ESLint (expo config plus no-literal-colour rule), Prettier, `typecheck` / `lint` / `test` scripts, Jest with RN Testing Library.
- Env handling: `.env.example`, a Zod-validated `src/lib/env.ts`, and only `EXPO_PUBLIC_*` values in the app.
- Supabase client with the encrypted session storage (D-006), TanStack Query provider, error boundary, and splash-gated bootstrap.
- Base navigation: the `(auth)` / `(onboarding)` / `(app)/(tabs)` groups with placeholder screens, guarded by a stubbed status (dev only).
- `git init` plus `.gitignore` (env files, keystores, `receipts/`, `review-receipts/`, build outputs). No commits unless the owner asks.
- Android toolchain: pin JDK 17 for Gradle and create an AVD (or use a connected device).

**Exit:** typecheck, lint and tests green. `npx expo run:android` installs and launches, and the tab shell renders on the emulator (screenshot inspected).

## Phase 2: Brand + design system (done, 2026-09-27)

**Result:**
- **Fonts:** OFL Schibsted Grotesk (body) and Instrument Serif (display) are embedded natively as weight-mapped families, so there is no font-swap flash.
- **Logo:** black and white variants from the hi-res original are used on the light and dark splash and by `SoulLogo`.
- **Tokens:** colour (light, dark, the romantic accent and fixed brand-moment surfaces), type scale with Android font-scaling bounds and a compact-width adjustment, spacing, shape, sizes, icons and motion (skill-table springs and easings).
- **Primitives:** SoulText, SoulButton, PressableScale, SoulInput, SoulScreen, SoulLogo, SoulPhoto, SoulAvatar, badges, Skeleton and the state views. Material Symbols is the single icon family.
- **Preview:** a dev-only design-system preview at `soul://design-system`.
- **Docs:** `DESIGN_SYSTEM.md` and `MOTION_SYSTEM.md`.

**Verified on the emulator:** light and dark appearances, and 1.3× font scale. Two defects were found and fixed: content scrolling under the edge-to-edge status bar, and centered serif text clipping its last word. 33 unit tests are green, including a WCAG contrast test of every token pair in both appearances. Typecheck, lint and format are clean.

**Deferred on purpose:** SoulSheet and SoulModal until the first sheet in Phase 7 (evaluating `@expo/ui` BottomSheet against Router `formSheet`). Pixel-perfect comparison has no design reference yet (no Figma); it runs against approved screens in Phase 18.

### Original plan

**Objective:** SOUL looks like SOUL before any feature is built.

**Skills:** mobile-design-system, expo-design-system, ui-designer, frontend-implementation, creative-coder, accessibility-engineer, expo-animation, expo-ui, pixel-perfect, grade, mobile-design-review, ui-ux-pro-max (search only).

**Work:** tokens (colour, type scale with Android font scaling, spacing, radii, borders, motion, layers, component heights, icon sizes); the font loader (brand fonts when supplied, fallback otherwise, D-021); logo usage (`SoulLogo`, D-022); one monochrome icon family; the primitives SoulText, SoulButton, SoulInput, SoulScreen, SoulSheet (@expo/ui vs gorhom decision, D-005), SoulModal, SoulPhoto, SoulAvatar, SoulBadge, VerifiedBadge, HotPersonBadge, LoadingState, EmptyState, ErrorState, PermissionState; an internal `design-system` preview route (dev only); `DESIGN_SYSTEM.md` and `MOTION_SYSTEM.md`.

**Exit:** the preview renders on Android. Screenshots are reviewed with pixel-perfect and design-review. The type hierarchy and spacing are judged non-generic. Font scaling at 1.3x holds.

## Phase 3: Supabase foundation (done, 2026-09-27)

**Later changes (Phase 4, spec v2):** `approved_zones` and the `verification-private` bucket were dropped (4 buckets remain); pgTAP grew to 49 assertions in 3 files and `db:verify` to 16 checks. The text below is the original Phase 3 record.

**Written, not yet run:**
- **Migrations** in `supabase/migrations`:
  - private schema, PostGIS, enums
  - `account_private` (server-owned verification and state; owner read-only)
  - `profiles` (owner-only, with column-level update grants for editable fields)
  - `blocks`, `admin_roles`, `feature_flags`, `app_config` (client-visible keys only), `audit_events`, `approved_zones` (geography multipolygon, no client access)
  - helpers `is_blocked` and `has_admin_role`
  - new-user provisioning and email-confirmation mirroring triggers
  - `get_my_status()`
  - five private storage buckets with owner-folder policies on `profile-photos`
- **Seed:** neutral feature flags and config.
- **pgTAP:** 26 assertions in `supabase/tests/database/001_rls_foundation.test.sql`.
- **Edge Function shared helpers** (auth, safe error envelope, Zod body parsing) and a `health` function.
- **App:** the route guard now reads `get_my_status()`, with `unavailable` (retry) and `restricted` states. 36 unit tests are green.

**Unblocked and verified:** with owner permission, Docker Desktop's disk moved to `D:\soul-dev\docker\wsl`. The disk was copied first, the setting changed, and Docker verified running from D: with all existing images intact (including the owner's own) before the C: copy was removed. C: went from 0.1 GB to 13.75 GB free. The stack started, all 4 migrations and the seed applied cleanly, **pgTAP passed 26/26** on the first run, and **`npm run db:verify` passed 8/8** end-to-end HTTP checks (RPC, RLS denials, Edge Function 200 and 401). Types were generated into `src/types/database.ts`, and the client is typed. On-emulator verification of the status RPC with a real signed-in session moves to the start of Phase 4, which builds sign-in (the emulator is being re-created on D:).

**Earlier blocker (resolved):** the C: drive reached 100 % during the first Supabase image pull. Docker's storage turned read-only and the stack could not start. Recovery: stopped the emulator, Supabase and Docker; deleted only this session's emulator (5.6 GB) and its system image (2.3 GB), leaving 8 GB free. The npm cache moved to D:. **The owner must move Docker Desktop's disk image to D:** before local Supabase can run. Then: `supabase start`, `db reset`, `test db`, type generation, and an emulator check of the status RPC.

### Original plan

**Objective:** a local Supabase with the schema backbone, RLS framework and type generation.

**Skills:** postgres-patterns, database-migrations, security-checklist, api-design.

**Work:** `supabase init`; local stack in Docker; PostGIS and pg_cron; base migrations (profiles, account_private, preferences, feature_flags, app_config, audit_events, admin_roles); RLS helpers (`is_blocked`, owner checks); storage buckets and policies; Edge Function skeleton (shared auth, Zod, error envelope); seed data using neutral identities; `supabase gen types` into `src/types`; pgTAP harness with the first deny tests; `DATABASE.md` and `SUPABASE.md`.

**Exit:** `supabase db reset` is clean, pgTAP passes, the app reads the status RPC from local Supabase on the emulator.

## Phase 4: SRMIST auth (done 2026-09-27, Android and iPhone-size web)

**Flow (spec v2, D-027 to D-029):** Welcome → Rules (five boxes, all required) → SRMIST email → 6-digit OTP → date of birth (18+, once) → profile setup (Phase 5).

**Server:**
- Auth `before_user_created` hook rejects every domain not in `app_config.allowed_email_domains` (only `srmist.edu.in`), including look-alikes and subdomains.
- Email OTP: 6 digits, 10-minute expiry, 60 s resend window, custom template, single use.
- The ticked rules version travels with sign-up and is recorded at account creation; `accept_terms()` handles later version bumps.
- `set_date_of_birth()`: once only, 18+; an under-18 entry stores nothing and locks re-entry for 30 days. Zodiac derived on the server.
- `get_my_status()` returns the steps `{email, terms, age, profile}`; the app routes on it.
- Required config rows live in a migration (not the seed), so production cannot start without them.

**App:** Welcome, Rules, Email, Verify code (6 cells, resend timer), Legal documents (marked drafts, C-23), Birthday (confirm with the computed age), Age locked. Errors are mapped to calm copy with no raw server strings and no account enumeration.

**Verified:**
- pgTAP 49/49 and `npm run db:verify` 16/16 (real Auth: gmail and look-alikes refused, OTP delivered, wrong code refused, correct code signs in, replay refused, self-verification denied, cross-account read denied).
- On the Android emulator, a full run against local Supabase: rules → SRMIST email → OTP from Mailpit → DOB → profile-setup placeholder. The database row shows the verified email, terms version `2026-09-27-draft`, the DOB and zodiac.

**Closed in phase P:** the blank icons on Android (fixed by the embedded SoulIcons subset) and the same flow in an iPhone-size web viewport (PWA.md "Verified").

## Phase P: Platform amendment (done 2026-09-27)

**Result:**
- Web target: single-page app with `public/index.html` (PWA meta tags, 480 px phone column, no inline scripts), manifest, placeholder icons from the supplied logo, and an app-shell-only `sw.js`.
- Fonts and icons: `fonts.web.ts` registers every face with weight descriptors; `SoulIcon` renders a Material Symbols subset (`SoulIcons`, 23 glyphs, about 4 KB per weight, `npm run icons:subset`) instead of expo-symbols.
- Body font changed after owner feedback (now Alegreya Sans, owner's choice); button labels use a dedicated Bold `button` role (D-021).
- Services: `secure-storage` (Supabase session: SecureStore natively, localStorage on the web), `install-context`, `pwa`; contracts for location, heading, camera, notifications, payments and device-integrity.
- Website routes `/download` (reads `/downloads/latest.json`) and `/install`; Welcome shows the right hint per browser. The routes exist only in the web build.
- Checkbox and button state use ARIA props, which work on Android and the web (react-native-web ignores `accessibilityState`).
- Web tab bar: `(app)/(tabs)/_layout.web.tsx` uses the JS bottom tabs with SoulIcons (NativeTabs renders a text-only tab list in a browser); both layouts share `src/features/shell/tab-items.ts`.
- Verified: see PWA.md "Verified". 53 unit tests, typecheck, lint and format are green.

**Android check (after a rebuild, since fonts are embedded):** the check and error icons render (they were blank), the new body font is used everywhere, button labels use their own role, the Welcome screen shows no install hint in the native app, and the keyboard-sticky footer holds on the email step.

**Carried forward:** a physical iPhone test needs HTTPS hosting (C-26); web bundle size is a Phase 19 item; the dev client shows Expo's floating tools button (development builds only).

**Original plan:**
- Web target in `app.config.ts` (static output, favicon, theme colours), `npm run web` and `npm run web:export`.
- Brand fonts and the icon font registered on the web with weight descriptors, so `fontWeight` behaves as it does on Android; first render waits for them.
- Icon font: a Material Symbols subset (only the glyphs SOUL uses, light 300 and regular 400) embedded on Android and loaded on the web; `SoulIcon` renders glyphs from a typed map.
- `src/services/*` adapters (`*.native.ts` / `*.web.ts`): secure-storage, location, heading, camera, notifications, payments, device-integrity. Supabase session storage goes through `secure-storage`.
- PWA: manifest, Apple meta tags, `viewport-fit=cover`, an app-shell-only service worker that never caches API, auth, storage or realtime traffic, and a phone-width layout cap on large screens.
- Website routes `/download` and `/install`; the Welcome screen shows the right hint per browser.

**Exit:** typecheck, lint and tests green; the SRMIST sign-in flow passes in a 390 × 844 web viewport against local Supabase; the Android dev build shows icons; the service worker is verified not to cache private traffic.

## Phase 5: Profile (done 2026-09-27)

**Server:** migration `…0700_profile.sql`: `gender`, `preferences`, `profile_photos`, owner-folder policies for the blurred bucket, `add_profile_photo`, `remove_profile_photo`, `reorder_profile_photos`, `submit_profile`, `get_my_profile`, photo limit and review flag in `app_config` (D-041).

**App:**
- Onboarding profile setup: main photo (camera first, gallery fallback), then photos, name, gender, show me, hook, About Me.
- The You tab shows your profile exactly as others see it (vertical viewer, anonymous preview included).
- Edit profile, Privacy (visible / private / anonymous, zodiac toggle), Settings (edit, privacy, policies, sign out).
- New shared pieces: `SoulChip`, `ProfileView`, `PhotoGrid`, `ProfileForm`, the camera service (expo-image-picker) and on-device photo processing (expo-image-manipulator).

**Verified on web (iPhone size, local Supabase):**
- The full new-account flow runs from rules to the tabs.
- Photo upload stores 1080 × 1350 JPEG plus a 24 px copy, approved.
- Validation messages show.
- Saved text is cleaned.
- Anonymous preview uses blurred copies and hides the name; zodiac shows when on.
- Make main and remove both work, removed files are deleted, and the last photo cannot be removed.
- Edit saves.
- Also passing: pgTAP 77/77, `db:verify` 16/16, 63 unit tests, typecheck, lint, format.

**Fixed during testing:** quick consecutive form changes could overwrite each other (stale state); the form now uses functional updates. Save from an Edit page opened by link now returns to You.

**Verified on Android (emulator, clean rebuild with the new native modules):**
- The web test account signs in on Android and lands in the tabs (same account on both platforms).
- The You tab shows the photos, name, age, verified badge, hook, About Me and zodiac.
- Camera path: permission prompt → emulator camera → crop → upload, stored as `camera`, 1080 × 1350, no EXIF.
- Privacy radios and the zodiac switch report their checked state to Android accessibility.
- The deep link `com.soul.srm://settings/privacy` opens the right screen.
- The merged manifest has CAMERA and no RECORD_AUDIO.

**Fixed on Android:** photo-grid tiles rendered tiny, because the percentage width sat on the inner animated view. `PressableScale` now takes a `containerStyle` for layout.

**Carried forward:**
- Automated photo checks (C-30).
- Release permission review (Phase 20): `SYSTEM_ALERT_WINDOW`, `USE_BIOMETRIC` and `USE_FINGERPRINT` come from the dev client and libraries.
- Expo's dev "Tools" bubble overlaps the settings button in dev builds only.

## Phase 6: Discovery (2026-09-27)

**Server:** migration `…0800_discovery.sql`:
- `likes` and `passes` tables.
- `discovery_feed`, `get_profile_card`, `swipe_right` (idempotent) and `swipe_left`.
- Visibility helpers, plus Storage policies so other students' photos can be signed only under the same rule (D-042).

**App:**
- Discover tab: swipe deck with the next card underneath, Pass and Like buttons, loading, empty ("all caught up", adjust filters, refresh), error and not-eligible states.
- Full profile page with Pass and Like.
- Filters sheet: age steppers, show me, zodiac. Settings → Discovery preferences.
- Deck store: optimistic swipes restored on failure, paging before the queue runs low, and late pages from an older deck ignored.
- New pieces: `SoulChip`, `PhotoScrim`, `SoulButton` `accent`, `swipe` motion tokens, `containerStyle`.
- Local seed: `python scripts/seed-local-discovery.py` makes 12 neutral candidates (`--remove` to delete).

**Verified:**
- pgTAP 115/115, `db:verify` 28/28 (real Storage signing rules), 77 unit tests including the deck store.
- On web, the feed renders with the next card, the gradient and signed photos.
- On the Android emulator:
  - Real flicks commit likes and passes, short drags spring back, the mid-drag stamp and tilt show, and the buttons commit.
  - Anonymous cards are blurred with no name.
  - Filters save and refresh the deck; the full profile page likes; the empty state shows.

**Fixed during testing:**
- Name and age were one nested text, and Android once dropped the age. They are now separate texts, so a long name truncates while the age stays visible.
- Pass and Like on the profile page did not share the row (layout on the inner view); fixed with `containerStyle`.
- A deck refresh while an older page was loading could stay stuck on "loading".
- The next card was announced to screen readers on the web.

**Web in a real mobile browser (the emulator's Chrome, real touch):**
- Sign-in, the deck, flick right and left, a short drag springing back, the Like button, and a tap opening the profile all work.
- **Bug found and fixed:** with the keyboard open, pinned footers (Send code, Continue) sat under the keyboard on the web. Fixed two ways:
  - `interactive-widget=resizes-content` (Android Chrome resizes the page).
  - A `visualViewport` keyboard inset in `SoulScreen` (iPhone Safari keeps the page size). Verified in Chrome; the iPhone path needs a real iPhone.

**Open:** the new `remove` icon needs the Android rebuild that embeds the icon font.

---

## Original per-phase plans (pre-spec-v2 numbering; kept for history)

The headings below use the old numbering. Current numbers are in the table at the top. Void parts: geofence (old Phase 6), student ID, selfie and face match, and Play Billing as the V1 path.

## Phase 5: Profile

**Skills:** mobile-taste, ui-designer, expo-native-ui, expo-ui, accessibility-engineer.

**Work:** primary and extra photos (moderation states), age, gender and preference (C-13), 30-character hook, About Me, optional zodiac derived from verified DOB, edit profile, privacy settings, and the vertical profile viewer.

**Exit:** create, edit and view work on the emulator; validation is enforced server-side; the visual check passes.

## Phase 6: Geolocation

**Skills:** postgres-patterns, security-checklist, ux-designer (permissions).

**Work:** primed permission flow, `approved_zones` with dev polygons (C-09), the `check_location` function, inside/outside/disabled states, mock-location signal capture, and no coordinate persistence.

**Exit:** pgTAP boundary tests (inside, outside, edge, disabled zone); emulator mock-location tests of each UI state.

## Phase 7: Discovery + filters

**Skills:** expo-animation, mobile-taste, react-native-patterns, postgres-patterns.

**Work:** the `discovery_feed()` function (eligibility, preferences, blocks, privacy modes, ranking by recency, fairness and completeness), the swipe card (Gesture Handler plus Reanimated, velocity hand-off), pass, the like call (stubbed to Phase 8/9 logic), the filter sheet (age, gender compatibility, zodiac), and the anonymous/private rendering rules.

**Exit:** a smooth swipe on the emulator (no dropped frames visible in the perf monitor); feed rule tests pass.

## Phase 8: Swipe credits + entitlements

**Work:** plan catalog seed (C-10 and C-11 flagged), the ledger, the `swipe_right` transaction, the balance RPC, the paywall and the balance UI. **Exit:** race tests (parallel swipes can never overspend), replay tests, and the paywall visible when exhausted.

## Phase 9: Matching

**Work:** reciprocal match inside `swipe_right`, duplicate prevention, the match overlay, the match list and unmatch. **Exit:** concurrency tests (simultaneous mutual likes produce exactly one match).

## Phase 10: Chat

**Skills:** expo-animation, react-native-patterns, expo-data-fetching, creative-coder.

**Work:** conversations, FlashList messages, `send_message`, the broadcast trigger, the floating composer (keyboard-controller), typing indicator, delivery and read state, reply, report/block/unmatch. **Exit:** two-device or two-emulator realtime test; keyboard behaviour inspected on screen.

## Phase 11: Instant Meet

**Work:** plan gate, opt-in with duration, presence, candidate matching, mutual accept, session, the location posting function, proximity buckets, compass UI (heading plus damped interpolation), timer, session chat, End Meet, expiry, extension by mutual consent, meeting point, first-use safety notice and "Everything okay?". **Exit:** a **location-leak audit** (no client API returns another user's coordinates); an end-session revocation test.

## Phase 12: Date confirmation + Hot Person

**Work:** confirmation rounds, mutual-only events, anti-duplicate rules (C-14), the rolling 30-day recompute plus pg_cron, the badge, and private progress. **Exit:** badge logic tests at the window boundaries.

## Phase 13: Billing

**Skills:** eas-app-stores (reference), security-checklist.

**Work:** the provider interface, the test provider, Play Billing (PBL 8 or later, library chosen after verification), server verification, RTDN, restore, expiry, refunds and revocation. **Blocked on:** C-15 for production verification; the test provider path completes without it.

## Phase 14: Privacy + safety + moderation

**Work:** finish the anonymous and private modes, block (all side-effects), report (few taps), the moderation queue, suspension, photo review, delete account (real), verification data retention jobs, and Play Integrity signals (owner setup). **Exit:** abuse-case tests.

## Phase 15: Notifications

**Work:** match, message, Instant, verification and purchase notifications; deep-link routing; no engagement spam. **Blocked on:** C-16 for real push delivery.

## Phase 16: Admin / operations

**Work:** role-checked admin functions and a minimal admin UI (D-019) for reports, bans, verification review, photo review, zones, plans, flags and badge abuse.

## Phase 17: Testing

Unit, integration, RLS, constraints, Edge Functions, match and credit races, chat, blocking, Instant, location privacy, entitlements, badges and deletion, all with deterministic neutral test users.

## Phase 18: Visual QA

**Skills:** mobile-taste, mobile-design-review, pixel-perfect, grade, ux-designer, usability-psychologist.

Every major screen gets an Android screenshot review against the spec list (fonts, hierarchy, whitespace, cropping, keyboard, nav, sheets, composer, compass, paywall, verification, profile).

## Phase 19: Security audit

Enable `soul-audit` (`claude plugin enable soul-audit@soul-local`, then a new session). Run production-readiness, security-audit and data-protection-audit, then the manual cross-account attack attempts. Fix the findings.

## Phase 20: Performance / production readiness

Startup, memory, images, scrolling, frame drops, realtime, query load, location frequency, reconnect, battery and crash handling. Also the observability, reliability and scalability audits.

## Phase 21: Android release

Release build config, signing workflow (owner keystore, C-20), launcher icon (C-02 and C-21), splash, versioning, permission review and copy, `BUILD_ANDROID.md` and `RELEASE_CHECKLIST.md`. **Final artifact:** an installable SOUL APK.

---

## Progress log

- 2026-09-27: Phase 0 complete. Logo archived and derived. Fonts missing (C-01). Planning docs created.
- 2026-09-27: Owner answers: pick fonts freely, which gave OFL Schibsted Grotesk + Instrument Serif (Aprila/Carade are personal-use only); the hi-res logo was fetched from the owner's Pinterest pin (rights = release blocker C-22); the white logo was approved; free swipes are one-time with no reset.
- 2026-09-27: Phase 1 complete (see above).
- 2026-09-27: Phase 2 complete (design system verified on the emulator, light and dark, 1.3× font scale).
- 2026-09-27: **C: drive full incident** during the Supabase image pull (see Phase 3). The disk rule was added to AGENTS.md.
- 2026-09-27: Owner feedback "too X": the direction became dating-first, with one romantic accent (wine/rose) for like, match and heart only (D-026).
- 2026-09-27: Final spec v2 + owner rules: email + OTP only, self-declared 18+, rules ticked first, no geofence, Instant 1 km, ₹199 plan = 25 right swipes. Phases renumbered.
- 2026-09-27: Docker Desktop's disk moved to D: with owner permission. Phase 3 verified (pgTAP, E2E HTTP checks).
- 2026-09-27: Phase 4 verified on Android end to end. Builds are memory-capped and run with the emulator and Docker stopped (page file on C:).
- 2026-09-27: Platform amendment: Android APK + iPhone PWA from one codebase (D-035 to D-040). `PLATFORM_MATRIX.md`, `PWA.md` and `BUILD_ANDROID.md` added; phase P started.
- 2026-09-27: Owner feedback on the button font ("looks normal"): body font changed from Schibsted Grotesk to Plus Jakarta Sans (OFL, has `₹`), chosen from 8 ₹-capable OFL candidates rendered side by side (D-021).
- 2026-09-27: Phase 4 and phase P done: Android dev build rebuilt with the embedded fonts and verified on the emulator; web tab bar added and verified. Next: Phase 5 (profile).
- 2026-09-27: Owner answers (round 2): gender options ok; accent kept; Razorpay; no plan-swipe rollover, top-ups never expire; Vercel free hosting on `*.vercel.app`; cloud Supabase project `bdwuhrkgrwzpwqhgsngi`; package `com.soul.srm` locked; production signing prepared but not generated; logo and compact icon mark are release blockers (placeholder app icon added); eight legal drafts written (terms version `2026-09-27-draft-2`); FCM + Web Push requirements documented. `vercel.json` added and its CSP verified locally with the production build.
- 2026-09-27: Owner found Plus Jakarta Sans too formal and chose Alegreya Sans (informal, humanist) for body text; body roles moved up 1 px for its small x-height; buttons use Bold (D-021).
- 2026-09-27: Clean Android rebuild as `com.soul.srm` (old `app.soul.dev` uninstalled from the emulator); Alegreya Sans, SoulIcons, placeholder app icon and the release-signing guard verified in the generated project and on the emulator (Welcome, Rules, Email).
- 2026-09-27: Phase 5 built and verified on web. C: free space fell to 8.8 GB (page file growth under memory pressure); the Android rebuild waits for space.
- 2026-09-27: Phase 5 done: Android verified after a clean rebuild (camera upload, cross-platform sign-in, privacy, deep link). Freed 3 GB on C: by removing the Gradle 9.3.1 cache my first builds left in the user profile (builds now use D:).
