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
| 6 | Discovery (location-independent) | done (web + Android verified; icon font rebuilt 2026-09-28) |
| 7 | Swipes + plans | done (Android + web verified; checkout itself is Phase 12) |
| 8 | Matching | done (Android + web verified) |
| 9 | Chat | done (Android + web verified, two live clients) |
| 10 | Instant Meet (the only location feature, 1 km) | done (Android + web verified; location-leak audit passed) |
| 11 | Date confirmation + Hot Person | done (Android + web verified) |
| 12 | Billing (SOUL web checkout, D-037) | done (Android + web verified on the mock provider; live Razorpay needs the owner's keys) |
| 13 | Safety + moderation | done (Android + web verified) |
| 14 | Push (FCM + Web Push) | done (Web Push verified for real; Android FCM awaits C-16) |
| 15 | Admin | done (Android + web verified) |
| 16 | Testing (incl. the cross-platform matrix in `PLATFORM_MATRIX.md`) | done (`npm run test:all`, CI, TESTING.md) |
| 17 | Visual QA (Android + iPhone-size web) | done (Android + PWA on Android; real iPhone pending) |
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

**Closed 2026-09-28:** the Android rebuild embeds the new `remove` icon (verified in Filters).

## Phase 17: Visual QA (2026-10-03)

**Method:** VISUAL_QA.md. Android emulator screenshots of every screen in spec 71 (logo, fonts, typography, spacing, profile, discovery, filters, chat, composer, keyboard, paywall, Instant compass, settings) in light and dark mode and at 1.3× font scale, plus the PWA in Chrome on the emulator. Real images: four neutral test accounts with abstract generated photos. Evidence: `docs/visual-qa/`.

**Fixed (7):**
- Text links indented by their padding (`SoulButton inline`).
- The match reveal waiting on a spinner (now drawn from the liked card).
- Teal web switches (Phase 14's `SoulSwitch`, confirmed).
- Instant's "Turn off" inset from the edge.
- Instant's duration choice falling below the fold when the "meet ended" note shows (now pinned with its button).
- The browser focus outline drawing a square inside the web composer (now the composer border shows focus).
- The newest chat message hidden when the web keyboard opened (the list returns to the end when it shrinks).

**Verified:** all checks green through `npm run test:all` (185 unit tests, pgTAP 672, `db:verify` 109).

**Not verifiable here:** motion feel on a slow phone (Phase 19), a real iPhone, splash continuity on a release build (Phase 20), deep links from outside a running development client.

---

## Phase 16: Testing (2026-10-03)

**Added (D-056):**
- `npm run test:all` and GitHub Actions CI (app, Edge Functions, database with a throwaway local stack; no secrets).
- `017_structure` pgTAP: schema-wide guarantees (RLS forced everywhere, no anonymous access, no direct writes, pinned search paths, closed private schema, service-only functions, no public buckets).
- Migration `…1003000700_hardening.sql`: PUBLIC loses execute on the private schema (five trigger functions still had it).
- TESTING.md: every spec 70 item mapped to its pgTAP file, HTTP check and device run; the cross-platform matrix in PLATFORM_MATRIX.md now records evidence instead of phase numbers.

**Verified:**
- pgTAP 672/672 across 17 files, `db:verify` 109/109, 185 unit tests, Deno check of 11 functions, types, lint and format: all through `npm run test:all`.
- **GitHub Actions green** on all three jobs (app, Edge Functions, database with the full HTTP checks on a fresh stack). Getting there fixed two CI-only problems: `npx deno` did not run on the runner (now `setup-deno`), and Deno tied the functions' `npm:` imports to the app's `node_modules`. One earlier run failed `db:verify` intermittently; failed checks now appear as annotations.
- **Cross-platform, live (Android emulator as Test User 01, the web as Test User 02):**
  - a message from Android appeared on the web at once, and the web's reply appeared on Android;
  - "Read" showed on both sides without a reload;
  - a block from the web account turned the open Android chat into "This conversation isn't available" (the block itself stays invisible).

**Not covered yet (TESTING.md):** Android FCM delivery (C-16), live Razorpay (C-25), a real iPhone, one Android and one PWA in the same Instant Meet, socket recovery after real network loss (Phase 19).

---

## Phase 15: Admin (2026-10-03)

**Server:** migration `…1003000600_admin.sql` (D-055):
- Appeals; the queue extended with appeals and flagged dates; exact account lookup and the account view (logged).
- Admin-only plans, likes and plan grants, and a typed allowlist of feature flags, including the new Instant Meet pause.
- A storage rule so moderators can see photos under review.

**App:**
- Settings → Admin (only for roles): the queue (reports, photos, appeals, flagged dates), find an account, then the report, account, plans and flags screens.
- The restricted screen: *Ask for a review*, the pending and answered states, and a live update when a moderator decides.

**Verified:**
- pgTAP 660/660 (70 new). `db:verify` 109/109 (3 new: students refused, moderators limited to their tools, appeals reaching moderators only). 185 unit tests.
- **Android (admin):** Settings → Admin; a harassment report with its evidence message; the reported account's view; 5 likes given with a logged reason (the balance went 3 → 8); the flags screen.
- **Web (the suspended person):** the restricted screen, then *Ask for a review* (pending). When the Android admin chose *Keep decision*, the answer appeared live. When the admin restored the account, the web session left the restricted screen for Discover on its own.
- Fixed while testing: the restricted screen did not hear moderator decisions (it sits outside the main app layout), and the restricted copy still pointed only to email support.

**Open:** C-31 (age-check locks), the support address (C-23).

---

## Phase 14: Push (2026-10-03)

**Server:** migration `…1003000500_push.sql` and the `push-register` and `push-send` Edge Functions (D-054):
- Devices, per-person choices and an outbox; triggers for matches, messages (never the text), Instant Meet sessions and payments.
- `pg_net` pings `push-send` on every queued notification; `pg_cron` (`soul-push`) retries each minute.
- Web Push (RFC 8291 encryption, RFC 8292 VAPID) and FCM HTTP v1, on WebCrypto only; a push-service allowlist for subscriptions.
- Devices removed at sign-out and on suspension, ban or deletion; dead subscriptions stop.

**App:**
- `services/notifications` for Android (expo-notifications, one channel, private lock-screen text per message, no banners while open) and the web (the service worker shows the push and routes a tap into the open app).
- A one-time "Know when they reply" card on Chats after a match; Settings → Notifications (this device, then four choices).
- A tapped notification opens only an allowed page (a chat, a match, an Instant Meet session or chat, Purchases).
- `SoulSwitch`: react-native-web painted the "on" thumb teal; switches are now monochrome on the web too (Privacy and Notifications).
- A placeholder status-bar icon (white ring, C-21) and the web notification badge.

**Verified:**
- pgTAP 590/590 (58 new). `db:verify` 106/106 (5 new: VAPID key published, a non-push-service endpoint refused, registration only through the server, sign-out removes the device, the outbox closed to the app). 179 unit tests (16 new, including the RFC 8291 test vector byte for byte, VAPID and the FCM assertion signatures); `functions:check` clean.
- **Real Web Push in Chrome on the Android emulator** (through Google's push service):
  - the Chats card asked, Chrome and Android allowed, and the device registered;
  - a message from Test User 02 arrived as "Test User 02 · Sent you a message" (the text was not in it; the lock-screen copy reads "Contents hidden");
  - tapping it opened that chat;
  - with Messages turned off, nothing was queued; signing out removed the device.
- **Android (new native build with expo-notifications):** the Chats card asked, Android 13's own prompt appeared (the channel is created first), and without the owner's Firebase file Settings → Notifications says "Notifications aren't ready yet" while the four choices still work. Android ignores an app-set channel lock-screen visibility, so privacy relies on each FCM message being `PRIVATE`.

**Open:** native FCM delivery needs the owner's Firebase project (C-16); the final notification icon needs the compact mark (C-21).

---

## Phase 13: Safety and moderation (2026-10-03)

**Server:** migration `…1003000400_safety.sql` and the `account-delete` Edge Function (D-053):
- Block and unblock; report with message evidence and email fingerprints.
- Moderator functions (queue, suspend, ban, restore, photo review, resolve) with an action log; the ban-aware sign-up hook; restriction details in `get_my_status`.
- Deletion that keeps purchase and safety records without the account; an hourly retention job.

**App:**
- One safety sheet (Report, Block, Unmatch) from the chat header, a profile ("Report or block"), the Instant Meet session header and an Instant candidate.
- The report screen (categories, details, "Also block"); Settings → Blocked, Data and privacy, Delete account.
- The restricted-account screen; status and profile re-read on moderator nudges.

**Verified:**
- pgTAP 532/532 (62 new). The tests caught a real bug: a variable named like a column made `moderation_set_state` fail; it was fixed before shipping.
- `db:verify` 101/101 (5 new: moderators only, report unreadable, block invisible to the blocked, deletion needs confirmation, deletion removes the account and its sessions). 163 unit tests; `functions:check` clean.
- **Web:**
  - From a chat: the sheet, then a report (stored with the 2 recent messages as evidence).
  - Blocking returned to an empty Chats; Settings → Blocked listed the person; Unblock emptied it.
  - A suspended account landed on "Your account is paused … until 6 Oct".
  - A throwaway account typed DELETE and was deleted (gone from the database, back on the welcome screen).
- **Android:** the safety sheet (native form sheet) and the report screen render correctly.

**Open:** moderator screens (Phase 15), C-30 automated photo checks, the support address and appeal process (C-23).

---

## Phase 12: Billing (2026-10-03)

**Server:** migration `…1003000300_payments.sql` and four Edge Functions (D-052):
- `payment_orders` (price frozen per order), `payment_events` (ids and amounts only), `payment_refunds`.
- Service-only functions: `payment_create_order`, `payment_attach_link`, `payment_mark_paid` (the single path to `activate_plan`), `payment_mark_refunded` (a full refund revokes what is left), `payment_mark_closed`, `payment_record_event`.
- Owner reads: `get_payment`, `get_my_payments`.
- Edge Functions:
  - `payments-checkout`: order plus Razorpay Payment Link.
  - `payments-webhook`: signature first; paid, refund, expired or cancelled.
  - `payments-sync`: asks Razorpay directly (restore).
  - `payments-mock`: development only; signs a Razorpay-shaped event and posts it to the real webhook.
- `npm run functions:check` type-checks every Edge Function with Deno.

**App:**
- The plans screen starts checkout:
  - Android opens Razorpay in an in-app browser tab (`expo-web-browser`, native rebuild).
  - The web app goes to Razorpay and comes back to `/pay/return`.
  - Development opens the test checkout (`/pay/mock`).
- `/pay/return` asks the server, syncs after 6 seconds, and shows paid, not completed, refunded or "still confirming". `public/pay-return.html` hands Android back to the app.
- Settings → Purchases: history and "Check for missed payments".
- Likes and history refresh when the server nudges (`reason: payment`).

**Verified:**
- pgTAP 470/470 (50 new): no client access, no self-grant, the frozen price, mismatched amount/link/currency rejected, one grant per payment, out-of-order expiry then payment, partial versus full refunds, revocation with used likes kept, a top-up refund, the open-order limit, events once, and the mock provider off unless allowed.
- `db:verify` 96/96 (9 new over HTTP):
  - checkout needs a session, and a price sent by the app is ignored;
  - unsigned and wrongly signed webhooks are refused and grant nothing;
  - nobody can pay another student's order;
  - a signed payment grants and nudges the phone, and a second payment event grants nothing;
  - sync works, and a full refund revokes.
- 159 unit tests, including Razorpay signature known-answer tests, payload parsing, the Payment Link request (no customer data) and the checkout URL allow-list.
- **Web, end to end** (local mock provider): Plans → 12 likes → test checkout → "Pay (test)" → "12 likes added"; the balance went 20 → 32; Purchases listed it as Paid; "Check for missed payments" said up to date.
- **Android (rebuilt with `expo-web-browser`):** Plans → Weekly → test checkout → "Pay (test)" → "Weekly is on, 15 likes for 1 week". The `com.soul.srm://pay/return?order=…` deep link that `pay-return.html` uses opens the same return screen.

**Open (owner, C-25):** Razorpay account with Payment Links, test keys, the webhook (URL, secret, events) and `supabase secrets set` (SUPABASE.md). Live keys and KYC before paid launch.

---

## Phase 11: Date confirmation and the fire badge (2026-10-03)

**Server:** migration `…1003000200_dates.sql` (D-051):
- `date_rounds` (answers, never readable by the app), `date_review_flags`, `private.hot_person_state`.
- `date_state`, `answer_date`, `get_my_dates`, `invalidate_date` (moderators only).
- The badge is computed live in the card function; an hourly `pg_cron` consistency job keeps the stored state and audit trail; a block voids pending rounds.

**App:**
- "Did you meet?" sheet (`/date/[id]`, a form sheet).
- The quiet row under a match chat's header once both have written.
- "Did you meet?" on the Instant tab after a meet ends.
- The private progress card on the You tab.
- The fire badge (icon only, owner's decision) next to the verified mark on Discover cards, profiles and the owner's own preview.
- Native rebuild for the `local_fire_department` glyph.

**Verified:**
- pgTAP 420/420 (63 new), `db:verify` 87/87 (5 new over HTTP and Realtime), 145 unit tests, typecheck and lint clean.
- **Privacy of answers:** after one yes, the other person's state is byte-for-byte what it was before. A "no" with nothing pending stores nothing. After both answered, the first yes learns "not counted".
- **Rules:** cooldown (no double count), expiry (a late yes starts a new round), the Instant source (7 days), blocks and unmatches.
- **Badge maths:** the window boundary (29.99 days counts, 30 days 1 minute does not), distinct partners, server config, moderation invalidation, review flags, the audit trail and the scheduled job.
- **Two browser sessions:** a yes showed "Waiting" for User C while Profile 07 still saw a plain "Did you meet?". Profile 07's yes confirmed it, and User C's sheet changed to "You both said you met" by itself.
- **Badge in the browser:**
  - With 3 dates, User C's You tab showed "3 dates in the last 30 days" and the fire next to the verified mark.
  - Profile 07's Discover card for User C showed the fire.
- **Chat row in the browser:** it appeared live once the second person wrote; "Not yet" closed the sheet and stored nothing.
- **Android (rebuilt for the fire glyph):** the You tab's progress card and the fire next to the verified mark render with the native icon font; the chat row opens the answer as a native form sheet; the composer's send icon renders.

**Open:**
- C-14 (distinct partners) stays for the owner to confirm; it is on by default.
- Reviewing flags and invalidating dates needs the admin surface (Phase 15).

---

## Phase 10: Instant Meet (2026-10-03)

**Server:** migrations `…1002000400_instant_meet.sql` and `…1003000100_instant_hardening.sql` (D-050):
- `private.instant_presence` (latest position only), `private.instant_accepts`, `private.instant_skips`, `instant_sessions` (who and when, never where); a session has its own conversation.
- `instant_start` (plan gate, 15/30/60 min), `instant_stop`, `instant_update_location`, `instant_candidates`, `instant_accept`, `instant_skip`, `instant_state`, `instant_end_session`. No function returns a coordinate.
- 1 km by `ST_DWithin` between ~110 m grid cells. One position every 2 s; impossible jumps refused. Positions count for 90 s and only within 200 m accuracy.
- Mutual acceptance under the pair lock. During a session: distance in 50/100 m steps, bearing in 15° steps, only "nearby" under 100 m.
- End Meet, Turn off, expiry (lazy sweep, no cron), a block or a lost plan end everything for both at once.

**App:**
- `expo-location` (foreground only, no Google accuracy dialog) and `expo-haptics`; native rebuild with the new icon glyphs (`navigation`, `send`, `timer`, `location_off`, `explore_off`).
- `src/services/location` and `src/services/heading` for Android and the PWA. Location is sent only while Instant is on and the app is in the foreground.
- Instant tab: plan gate with the plans that include it, setup with 15/30/60 and three privacy points, searching radar, candidate cards with no distance, waiting state, an "ended" note, and the way back into a live meet.
- Session screen (`/instant/session/[id]`): compass with a smoothed heading on a damped spring, rounded distance, timer, Message and End Meet.
- Session chat (`/instant/chat/[id]`): the Phase 9 chat with a distance pill and End Meet in the header.
- A session opens the compass on both phones by itself (account topic) and leaves an "ended" note when it closes.
- Also: the chat Send button is now an icon, and the first showing of a match reveal has a success haptic (both waited for this rebuild). `SoulChip` gained `fill` for equal chips in a row.

**Verified:**
- pgTAP 357/357 (71 new), `db:verify` 82/82 (14 new, over real HTTP and Realtime), 139 unit tests, typecheck and lint clean.
- **Location-leak audit:**
  - No client can read positions, acceptances or sessions (PostgREST `PGRST106` and `42501`).
  - No candidate list or state contains a coordinate (checked in SQL and over HTTP).
  - Nothing is shared before both accept, and one acceptance is invisible.
- **End-session revocation:** after End Meet, both states drop the session, both positions are deleted, the chat refuses messages, `closed` arrives, and joining the chat topic is refused.
- **Web, two browser sessions** (Profile 07 and User C, fake positions ~500 m apart):
  - Candidate cards on both sides; the waiting state, then a mutual yes.
  - The compass opened on both by itself, showing "~500 m". The arrow sat at 30°, the true bearing, and turned smoothly the short way to -60° when the heading changed.
  - Session chat with End Meet in the header; End Meet ended it for both, with no positions left on the server and the "ended" note on the tab.
  - A desktop browser with no compass says "Direction unavailable on this device".
- **Android emulator** (`adb emu geo fix`, a scripted second person over the API):
  - Foreground-only permission prompt (no "all the time").
  - Position on the server within seconds.
  - Candidate card, mutual yes, the compass opening by itself, "~500 m", then "~450 m" and "You're nearby" (no number, no arrow) as the other person walked closer.
  - The arrow appeared when the emulator's magnetic field turned.
  - When the meet ended: "This meet has ended", and the status-bar location indicator went away.

**Fixed during testing:**
- Reloading or deep-linking into a live session opened a second copy of the compass screen. The session-start push now skips a screen already open.
- The compass dial was an oval on Android (a percentage width with a max width and an aspect ratio). Dial and radar now have numeric sizes.
- Android reports a heading only after about 2° of turning, so a phone held still facing north looked like it had no compass after 3 s. It now asks for a small turn after 3 s and gives up only after 15 s, and a late first reading still brings the arrow.
- `mayShowUserSettingsDialog` opened Google's "Location Accuracy" consent dialog; it is now off.
- At phone width the "60 min" chip wrapped to a second line (equal `fill` chips now), and the paired buttons did not fill their half of the row.

**Open:**
- Real-device feel of the compass (sensor noise, figure-eight calibration) and iPhone Safari's compass prompt: Phase 17 on hardware.
- Mutual extension is deferred, ask the owner. Meeting points are not in spec v2.
- Mock-location and integrity signals for Instant: Phases 13 and 18.

---

## Phase 9: Chat (2026-10-02)

**Server:** migration `…1002000300_chat.sql` (D-049):
- `conversations` (one per match), `conversation_members` (read positions), `messages`.
- `send_message`, `get_messages`, `mark_conversation_read`; the match list now carries the conversation, its last message and the unread count.
- Private Realtime topics authorized by RLS on `realtime.messages`: the server publishes messages, read receipts and closes; clients may publish only typing.
- Unmatch closes the conversation and tells both devices.

**App:**
- Chat screen (`/chat/[id]`, also the `com.soul.srm://chat/<id>` deep link): bottom-anchored FlashList, older pages on scroll, day separators, grouped bubbles, reply by long-press, typing indicator, delivery line under the newest own message.
- Floating composer above the keyboard, growing to five lines.
- Optimistic sending with retry ("Not sent. Tap to try again.").
- Chats tab: last message, time, unread count; the tab count covers new matches and unread chats; both update live from the account's Realtime topic.
- The match reveal's Message button and a match's profile open the conversation.
- Privacy → Read receipts switch.

**Verified:**
- pgTAP 286/286 (47 new), `db:verify` 68/68, 125 unit tests, typecheck, lint and format clean.
- Realtime over real sockets (script): members join; an outsider and another account's topic are refused; a message arrives live; a forged client broadcast is not delivered; typing and read receipts arrive; unmatch closes.
- Two live clients, Android emulator and a browser, signed in as the two people of one match:
  - Messages arrived live in both directions, including with the Android keyboard open.
  - "Read" appeared on the sender's side without a reload.
  - The typing indicator showed on Android while the other person typed.
  - A long-press reply carried the quoted message.
  - With the API gateway stopped, a message showed "Not sent. Tap to try again."; after restart, one tap sent it, stored once.
  - Unmatching in the browser turned the open Android chat into "This conversation isn't available" by itself.
  - The composer sat flush above the keyboard and the newest messages stayed in view.
  - Dark mode holds.

**Fixed during testing:**
- **A bubble could lose its last word on Android** ("Yes! 5 pm at the" for "…canteen?") the second time a chat was opened. The view was the right size but drew a two-line layout. A trailing hair space gives single-line text the slack it needs (DESIGN_SYSTEM). Four opens in a row then rendered correctly.
- The typing indicator appeared below the fold; the list now scrolls to it for someone at the bottom.
- The browser composer was two lines tall when empty and did not grow; fixed.
- After unmatching from a profile opened from a chat, the app returned to the dead chat; it now goes to Chats.

**Open:**
- Photos in chat, report and block from the chat header: Phase 13.
- The emulator's keyboard showed its own "Try out your stylus" promo on first focus after a cold start; it is Gboard's, not SOUL's.

---

## Phase 8: Matching (2026-10-02)

**Server:** migration `…1002000200_matching.sql` (D-048):
- `matches`: one row per ordered pair, created only inside `swipe_right` under a pair lock.
- `get_my_matches`, `get_match`, `mark_match_seen`, `unmatch`.
- A match stays visible when filters change; an unmatched pair never sees each other again.
- `profiles.reveal_on_match` decides whether an anonymous person's name and photos show to matches; Storage signing follows the same rule.

**App:**
- Match reveal (`/match/[id]`) on the black brand surface: both photos, "It's a match", Message and Continue.
- Chats tab lists matches, newest first, with a "NEW" pill and a count on the tab for unseen ones. Opening an unseen match plays its reveal.
- A match's profile offers Unmatch, confirmed in the pinned footer.
- Privacy → Anonymous shows the "Show my name and photos to matches" switch.

**Verified:**
- pgTAP 239/239 (46 new), `db:verify` 56/56, 106 unit tests, typecheck, lint and format clean.
- Concurrency over real HTTP: two people liking each other at the same moment made exactly one match per pair, announced to one of the two requests, and each like was charged once.
- Android emulator:
  - Liking someone who had already liked the account opened the reveal and marked it seen.
  - Message opened Chats with the match listed.
  - A like-back from the other side showed "1" on the Chats tab and a "NEW" row; opening it played the reveal.
  - The `com.soul.srm://match/<id>` deep link opened the reveal.
  - Unmatch confirmed in the footer, removed the row from the list, and left the match inactive on the server with who ended it.
  - The anonymous reveal switch saved both ways.
- Web (phone size): the list, the "NEW" pill, the tab count and the reveal.

**Fixed during testing:**
- The tab badge drew "0" on Android (`hidden` is not honoured); it now renders only when there is something to count.
- The reveal title could lose its last word ("It's a") when the centred italic serif was shrink-wrapped; it now spans the full width.
- The unmatch confirmation opened below the fold; it moved to the pinned footer.
- The badge did not update while staying on Discover; matches are now re-read every 60 seconds while the app is open.

**Open:**
- ~~Message opens Chats until Phase 9~~ done in Phase 9.
- No haptic on the reveal yet (needs a native rebuild; Phase 17).
- ~~Realtime replaces the 60-second refresh~~ done in Phase 9.

---

## Phase 7: Swipes and plans (2026-10-02)

**Server:** migration `…1002000100_swipe_credits.sql` (D-047):
- `plans` catalog with the owner's prices, `subscriptions`, and the append-only `swipe_credit_ledger`.
- `swipe_right` is now metered: one credit per new like, nothing for replays or repeat likes, `no_swipes` when empty.
- `get_my_swipes` (balance, plan, Instant entitlement) and the one-time free grant, remembered per SRMIST address.
- `activate_plan` (service role only) is the single way anything is granted; Phase 12's webhook will call it.

**App:**
- Discover shows likes left in a pill; a like updates it at once and the server's number replaces it.
- With no likes, the Like button or a right swipe springs the card back and opens the plans screen. Passing still works.
- Plans screen (`/paywall`): four plans and three top-ups from the catalog, one choice, price on the button.
- Settings → "Plans and likes" shows the balance and the plan's end date.
- `payments.checkout()` is a stub that reports `unavailable` until Phase 12.

**Verified:**
- pgTAP 193/193 (45 new), `db:verify` 50/50, 100 unit tests, typecheck, lint and format clean.
- Races over real HTTP: 7 parallel likes with 3 left charged exactly 3; 10 parallel requests for 2 people cost exactly 2.
- Android emulator:
  - 4 free likes counted down to 0.
  - A fifth like by button and by flick was refused without saving, and the plans screen opened.
  - A pass still saved at zero.
  - After a server-side `activate_plan` (monthly), the pill showed 25, then 24 after one like, with "Monthly until 2 Nov" on the plans screen and in Settings.
  - Dark mode holds.
- Web (phone size): the same balance, the plans screen, and a like going from 24 to 23.

**Open:**
- Buying is not possible until Phase 12 (Razorpay checkout and webhook). The button says so.
- Overlapping plans when buying while one is active is a default that needs the owner's confirmation (D-047).

---

## Hardening of earlier phases (2026-09-28)

The owner asked for no compromises left behind in finished phases. Found and fixed:

- **Photos were trusted to the app (Phase 5).** Photo intake is now server-side (D-043). The app uploads to a private inbox, and the `profile-photos` Edge Function publishes the photo:
  - checks the JPEG structure and reads the real size
  - strips EXIF/GPS, XMP, ICC, comments and trailing bytes (pixels unchanged)
  - writes the published copies itself and registers the photo

  Clients can no longer write, delete or swap published photos. Removal goes through the function too.
- **Edge Functions had no CORS (Phase 3).** The PWA could not have called any function from a browser. Every function now answers preflights and sends CORS headers. The gateway `verify_jwt` is off, and `requireUser` checks the caller, so it works with the new JWT signing keys (D-044).
- **A Phase 1 dev switch lingered.** `EXPO_PUBLIC_DEV_STATUS_OVERRIDE` was removed; the app reads exactly the three allowed variables (D-045).
- **A discovery test depended on an empty database.** `005` now compares only its own fixtures, so local seed data cannot break it.
- **Verification could be bypassed (Phase 4, security).** With email confirmations off, a password `signUp` for any SRMIST address returned a session at once, and the server marked the email verified without a code. Reproduced on the local stack, then closed (D-046):
  - confirmations are on
  - a custom access token hook refuses password sign-ins
  - a trigger keeps account emails inside the allowed domains (moving to gmail was also possible)
- **Discover showed "You're all caught up" for a moment** when the queue emptied faster than the next page arrived. It now shows loading (new deck-store test).
- **The full-profile page reloaded while sliding away** after Like or Pass: the card left the deck and the page fetched it again, showing a spinner. A double tap could also save twice and go back twice. The page now keeps the card it opened with and takes one decision per visit.
- **The "failed first swipe" on Android (open since Phase 6) is explained and fixed.** It was reproduced reliably: after a cold start, about half of the first flicks sprang back.
  - Cause: when the phone is busy right after launch, the release decision used the card position from the last frame, which can trail the finger. With a release velocity of 0 (the finger stops before lifting), a swipe past the line could still spring back.
  - Fix: the card now decides from the release event's own translation.
  - Found while checking: my first debug build logged with `console.log` from a worklet, which throws and fails the gesture; runs from that build were discarded.
- **The Filters sheet title sat on the sheet's top edge,** and on Android the sheet had no drag cue (the native grabber is iOS-only). In dark mode its black top edge was invisible against the dimmed screen. The sheet now has top room and an Android drag handle.

**Verified:**
- pgTAP 148/148 (new `006_photo_intake`, `007_auth_hardening`), `db:verify` 43/43, 88 unit tests (including 11 JPEG tests on fixtures with EXIF, GPS, XMP, ICC, a comment and a trailing payload).
- The cleaned fixtures decode with identical pixels (Pillow).
- On web against the local stack, adding a photo went through the inbox and the function (`approved`, position 2), and removing it deleted the row and both files.
- **Android (clean rebuild with the icon font, local stack):**
  - The Filters "−" icon renders.
  - A camera photo went through the inbox and the function: the server read 1080 × 1350 and emptied the inbox. Removing it deleted the row and both files.
  - A double tap on Like in the full profile saved one like and went back once.
  - Dark mode at 1.3× font scale holds on Discover, Filters, the full profile and You.
  - With email confirmations on, a returning account signed out and back in through the app with an emailed code (2026-10-02).
  - First gesture after a cold start (launched from the icon), after the fix:

    | Gesture | Committed |
    |---|---|
    | Slow drag | 3/3 |
    | 300 ms swipe | 4/4 |
    | 120 ms flick | 3/3 (one with release velocity 0) |

- **Remaining note:** a synthetic 120 ms `adb` flick under launch load can still deliver only two move events, so it registers under half the travel. Real touches are sampled by the hardware, but confirm on a real phone with a release build in Phase 17.

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
- 2026-09-27: Phase 6 built and verified on web (pane and real mobile Chrome in the emulator) and on Android; web footers now stay above the on-screen keyboard.
- 2026-09-28: Hardening of earlier phases: server-side photo intake (D-043), Edge Function CORS and key handling (D-044), dev status override removed (D-045), verification bypass through password sign-up closed (D-046), two Discover UI bugs fixed.
- 2026-10-02: Phase 7 done: plan catalog, swipe ledger, metered likes, balance and plans screen; race tests pass over HTTP. Checkout waits for Phase 12.
- 2026-10-02: Phase 8 done: matches created inside the like transaction under a pair lock, reveal, matches list with unseen count, unmatch, anonymous reveal setting (D-048).
- 2026-10-02: Phase 9 done: chat with private Realtime topics, read receipts, typing, reply, retry; verified with two live clients (D-049). C: drive filled to 2 GB free because the page file grew to 32 GB under memory pressure; the emulator now runs only during Android checks.
- 2026-10-03: Phase 10 done: Instant Meet with plan gate, 1 km candidates on a ~110 m grid, mutual acceptance, compass, rounded distance, session chat, End Meet and expiry; location-leak audit and end-session revocation tests pass (D-050). The owner freed C: (198 GB free). Native rebuild for expo-location, expo-haptics and the new icon glyphs.
- 2026-10-03: Phase 11 done: "Did you meet?" with private answers, cooldown, expiry and review flags; the fire badge (icon only, owner's decision) computed live from 3 dates in a rolling 30 days, with an hourly consistency job (D-051).
- 2026-10-03: Phase 12 done: Razorpay Payment Links with signed webhooks as the only grant path, frozen order prices, sync/restore, refund revocation and a mock provider that exercises the real webhook locally (D-052). Live payments wait for the owner's Razorpay keys.
- 2026-10-03: Phase 13 done: block (invisible to the blocked person), report with message evidence, moderator functions with an action log, bans that stop re-sign-up, immediate account deletion that keeps purchase and safety records, hourly retention (D-053).
- 2026-10-03: Phase 14 done: push for matches, messages (never the text), Instant Meet and payments; per-person choices; an outbox drained by `push-send` (FCM HTTP v1 and Web Push with RFC 8291 and VAPID); real Web Push verified on the emulator; Android FCM waits for the owner's Firebase project (D-054, C-16).
- 2026-10-03: Phase 15 done: a role-gated Admin section (reports with evidence, photos, appeals, flagged dates, exact account lookup, suspend, ban, restore; admins also plans, support grants and feature flags including an Instant Meet pause), every action checked by the server and logged (D-055).
- 2026-10-03: Phase 16 done: `npm run test:all`, GitHub Actions CI with no secrets, schema-wide structural tests (which closed a PUBLIC execute gap in the private schema), TESTING.md mapping every spec 70 item, live Android ↔ web chat, receipts and block (D-056).
- 2026-10-03: Phase 17 done: every spec 71 screen reviewed on Android (light, dark, 1.3× text) and the PWA; seven defects fixed (link alignment, the reveal's wait, Instant's hidden duration choice, web composer focus and keyboard), VISUAL_QA.md with screenshots.
