# SOUL

**Only for SRM.** A dating app for verified SRM students (18+): an Android APK installed from the SOUL website and an iPhone PWA from the same code. Built with Expo SDK 57, React Native, TypeScript, Expo Router and Supabase.

Status: Phases 0 to 20 are built (see [PHASE_PLAN.md](PHASE_PLAN.md)). Nothing is deployed from this repository: the owner publishes the server, the website and the APK ([RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)).

## What is in the box

| Part | Where |
|---|---|
| App (Android and web) | `src/` (routes in `src/app`, features in `src/features/<domain>`, shared `Soul*` components in `src/components`, tokens in `src/theme`) |
| Database, rules and server logic | `supabase/migrations` (Postgres with forced row-level security), `supabase/tests/database` (pgTAP) |
| Edge Functions | `supabase/functions` (payments, push, photos, account deletion) |
| Website pages and PWA shell | `src/app/download.tsx`, `src/app/install.tsx`, `public/` |
| Build and check scripts | `scripts/` |

## Requirements

- Node 22.13+ (Node 24 used), npm 11
- Docker Desktop and the Supabase CLI (installed through npm) for the local backend
- For Android: JDK 17, the Android SDK with platform 36, and an emulator (AVD `soul_pixel_api36`) or a phone

## First run (local, nothing hosted)

```bash
npm install
npm run db:start                    # local Supabase in Docker (migrations and seed applied)
npm run env:init -- development     # creates .env and supabase/functions/.env with local values
npm run env:check -- development
npm run android:build               # development build for the emulator (BUILD_ANDROID.md)
npm run emulator
npm start                           # Metro for the dev client
npm run web                         # or the web/PWA build in a browser
```

Sign-in codes from the local stack arrive in Mailpit at `http://127.0.0.1:54324` (only `@srmist.edu.in` addresses are accepted).

## Environment files

Kept out of git; each has a committed `*.example` template. Details: [BUILD_ANDROID.md](BUILD_ANDROID.md) "Environment".

| File | For |
|---|---|
| `.env` | the app against the local stack |
| `.env.production` | the app against the hosted project (release APK, website) |
| `supabase/functions/.env` | local server secrets (mock payments, local push keys) |
| `supabase/functions/.env.production` | hosted server secrets (Razorpay, Web Push, FCM), sent with `supabase secrets set --env-file` |

Only `APP_ENV`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` ever reach the app. Never put a secret in the app files; `npm run env:check` refuses one.

## Commands

| Command | Does |
|---|---|
| `npm run test:all` | every check: types, lint, format, source text, unit tests, Edge Functions, pgTAP, `db:verify`, `security:attack` ([TESTING.md](TESTING.md)) |
| `npm run typecheck` / `lint` / `test` / `format:check` | the individual app checks |
| `npm run db:start` / `db:stop` / `db:reset` / `db:test` / `db:verify` / `db:types` | local database ([SUPABASE.md](SUPABASE.md)) |
| `npm run security:attack` | one student attacking another account's data through every route ([SECURITY_AUDIT.md](SECURITY_AUDIT.md)) |
| `npm run functions:check` | Deno type check of every Edge Function |
| `npm run env:init` / `env:check -- development\|production` | environment files |
| `npm run android:build` | development build |
| `npm run android:test-apk` | release-optimised test APK against the local stack |
| `npm run android:release` | the production APK (needs the owner's signing key) |
| `npm run web:export` | the website and PWA into `dist/` ([PWA.md](PWA.md)) |

## Documentation

| Doc | Purpose |
|---|---|
| [PHASE_PLAN.md](PHASE_PLAN.md) | phases, what was verified, progress log |
| [DECISIONS.md](DECISIONS.md) | decisions and open owner configuration (`CONFIG_REQUIRED`) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | system and code architecture |
| [SECURITY_MODEL.md](SECURITY_MODEL.md) / [SECURITY_AUDIT.md](SECURITY_AUDIT.md) | threat model and the Phase 18 audit |
| [PERFORMANCE.md](PERFORMANCE.md) | the Phase 19 audit and measurements |
| [BUILD_ANDROID.md](BUILD_ANDROID.md) / [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | APK builds, signing, permissions, releases |
| [PWA.md](PWA.md) | the iPhone PWA and the website |
| [SUPABASE.md](SUPABASE.md) / [DATABASE.md](DATABASE.md) | backend, secrets, schema |
| [TESTING.md](TESTING.md) / [PLATFORM_MATRIX.md](PLATFORM_MATRIX.md) / [VISUAL_QA.md](VISUAL_QA.md) | tests, platform coverage, visual review |
| [MOBILE-DESIGN.md](MOBILE-DESIGN.md) / [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) / [MOTION_SYSTEM.md](MOTION_SYSTEM.md) | design |
| [skills/SOUL_SKILL_MAP.md](skills/SOUL_SKILL_MAP.md) | Claude skills used to build SOUL |
