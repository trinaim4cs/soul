# SOUL: iPhone PWA

SOUL for iPhone is the same Expo Router app built for the web and installed from Safari (Add to Home Screen). It must feel designed for iPhone, not like a website.

## Build and run

```bash
npm run web            # dev server (expo start --web), http://localhost:8081
npm run web:preview    # the production build against the LOCAL stack, http://localhost:8082
npm run web:export     # the production build into dist/ for hosting (reads .env.production)
```

Test the production build and service worker locally with `web:preview` only. `web:export` reads `.env.production`, so its `dist/` talks to the **hosted** project: serving it locally and signing in would send real requests (a sign-in code, likes) to the hosted servers. `web:preview` builds from `.env` alone (`EXPO_NO_DOTENV=1`, because Expo would otherwise let `.env.production` win while bundling), refuses to serve a bundle that names the hosted project, and serves `dist/` with the same rewrite as the host (`scripts/web-preview.mjs`). Never deploy a preview build; the host runs its own `web:export`.

The web build is a **single-page app** (`web.output: 'single'`): every route renders in the browser, never on a server, so no account code runs at build time. The host must:
- serve over **HTTPS** (geolocation, the service worker and install all require it); host and domain are C-26;
- rewrite every unknown path to `/index.html` (so `/download`, `/install` and deep links work);
- send the Content-Security-Policy and HSTS headers from SECURITY_MODEL section 12;
- serve `sw.js` with `Cache-Control: no-cache` so service-worker updates are picked up.

Files: `public/index.html` (the HTML shell and PWA meta tags, no inline scripts), `public/manifest.webmanifest`, `public/icons/` (temporary monochrome placeholders, `scripts/make-placeholder-icons.py`, C-21) and `public/sw.js`. Everything in `public/` is copied to `dist/` as is.

## Hosting on Vercel (C-26)

Free Vercel hosting with the generated `*.vercel.app` domain for development and beta. A custom domain is optional and never blocks a build phase; SOUL works fully without one.

- `vercel.json` holds the build (`npx expo export --platform web` into `dist/`), the single-page rewrite, the Content-Security-Policy and security headers, and the cache rules (hashed files immutable, `sw.js` never cached).
- Vercel project environment variables (Production and Preview): `APP_ENV=production`, `EXPO_PUBLIC_SUPABASE_URL=https://bdwuhrkgrwzpwqhgsngi.supabase.co`, `EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key>`.
- Deploys come from the GitHub repository. The Vercel URL is also the Supabase Site URL.
- The beta URL is shared only with testers (owner, 2026-09-27).
- **The APK download (Phase 20):** `npm run android:release` copies `soul-<version>.apk` and `latest.json` into `public/downloads/` (git-ignored), so the next deploy publishes them at `/downloads/`. `/download` reads `latest.json` and shows the version, size and SHA-256. `vercel.json` serves the APK as `application/vnd.android.package-archive` and `latest.json` uncached. Check the host's per-file size limit against the APK size (BUILD_ANDROID.md); if it is too large, host the APK elsewhere over HTTPS and put that address in `latest.json` (`url` accepts an `https://` address).
- Nothing in this repository deploys by itself: the owner connects the host and publishes (RELEASE_CHECKLIST.md).

## Web Push (C-16)

Standards-based Web Push, no Apple Developer or App Store account needed. On iPhone it works only for SOUL added to the Home Screen, on iOS 16.4 or later, after the user allows it. SOUL detects support and works fully without push. The VAPID key pair is generated for the project; the public key ships in the web app and the private key is a server secret (`supabase/functions/.env.production`, sent with `supabase secrets set --env-file`; SUPABASE.md).

## Requirements and how SOUL meets them

| Requirement | Implementation |
|---|---|
| Installable | `public/manifest.webmanifest` (name, short_name, `display: standalone`, monochrome theme and background, icons 192/512 + maskable) and Apple meta tags in the web HTML root |
| Standalone on iPhone | `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon` from the SOUL mark |
| Safe areas | `viewport-fit=cover` + `env(safe-area-inset-*)` via react-native-safe-area-context on web; standalone status bar style `default` (readable on light and dark screens) |
| No desktop look | phone-width column capped at 480 px (`#root` in `public/index.html`), centred on large screens; touch targets ≥ 48 px; no hover-only affordances |
| Keyboard | `visualViewport` keeps the composer and latest messages visible in Safari (Phase 9) |
| Fonts and icons | the same brand fonts and the SoulIcons subset, registered with weight descriptors by `src/theme/fonts.web.ts`; first render waits for them (3 s cap) |
| Offline | app-shell-only service worker; private data is never cached (DECISIONS D-040) |
| Capability detection | location, heading, camera and notifications go through `src/services/*` web adapters. Missing heading means Instant shows "Direction unavailable on this device" and keeps distance, chat, timer and End Meet |

## Privacy rules for the web build

- The service worker caches only static assets, never `/rest/`, `/auth/`, `/storage/`, `/realtime/` or `/functions/` traffic.
- There are no third-party scripts or analytics, and a strict Content-Security-Policy is set by the host.
- The session lives in `localStorage` (no keystore on the web); tokens are short-lived with refresh (D-040).
- Photos are fetched through short-lived signed URLs and are not cached by the service worker.

## Verified (2026-09-27, iPhone-size viewport 390 × 844, local Supabase)

- Welcome → Rules (five boxes) → SRMIST email → 6-digit code from Mailpit → Birthday → profile-setup placeholder. The database row shows the verified email, terms version and DOB.
- The session survives a reload; sign-out clears `localStorage`.
- Light and dark appearances; the centred column on a 1280 px screen.
- Production build (`dist/`): the service worker activates and caches only `/`, the manifest and hashed static files (JS, CSS, fonts, logo). Supabase requests and `/downloads/latest.json` were not cached.
- Not yet verified on a physical iPhone (needs HTTPS hosting, C-26).

**Performance note (Phase 19):** the web bundle is 3.4 MB (770 KB gzipped). Candidates: route-level code splitting and trimming unused modules.

## Install flow (iPhone)

Safari → open the SOUL site → sign in with SRMIST email → Share → Add to Home Screen → SOUL opens standalone. When SOUL detects iOS Safari not running standalone, the Welcome screen shows a short install hint.
