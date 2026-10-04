# SOUL: Release Checklist

Every public release of the Android APK and the website, in order. Each step names who does it. Nothing here is automated deployment: the repository holds the code and the scripts, and the owner publishes.

Details: [BUILD_ANDROID.md](BUILD_ANDROID.md) (APK), [SUPABASE.md](SUPABASE.md) (server), [PWA.md](PWA.md) (website), [SECURITY_AUDIT.md](SECURITY_AUDIT.md).

## Blockers before the first public release

| Item | Status | Owner action |
|---|---|---|
| Compact app-icon mark (C-21) | **open, release blocker** | supply an original or licensed compact mark; the launcher, notification and PWA icons are placeholders until then |
| Production signing key (C-20) | not created | run the `keytool` command in BUILD_ANDROID.md "Signing", back it up twice, record the fingerprint |
| Razorpay keys and webhook (C-25) | not set | test keys first, live keys after KYC, into `supabase/functions/.env.production` |
| Legal texts (C-23) | drafts, labelled "DRAFT — REQUIRES FINAL HUMAN/LEGAL REVIEW" | legal review, then replace the drafts and bump `current_terms_version` |
| Custom SMTP (C-28) | not set | Supabase dashboard → Authentication → SMTP (SUPABASE.md) |
| FCM service account (C-16) | not set | optional: without it Android has no push; everything else works |

## 1. Server (hosted Supabase project `bdwuhrkgrwzpwqhgsngi`)

- [ ] `npx supabase db push` applied every migration (owner, SUPABASE.md).
- [ ] `npx supabase config push` applied the auth settings and both auth hooks.
- [ ] Edge Functions deployed: `health profile-photos payments-checkout payments-webhook payments-sync account-delete push-register push-send`.
- [ ] `npm run env:check -- production` passes, then `npx supabase secrets set --env-file supabase/functions/.env.production`.
- [ ] Dashboard: Realtime "Allow public access" **off**; Auth rate limits no looser than `supabase/config.toml`; Confirm email on; SMTP set.
- [ ] `payments_allow_mock` is `false` (it is, unless someone changed it).
- [ ] The owner's admin role inserted (SUPABASE.md "Make yourself admin").
- [ ] Razorpay webhook points at `https://bdwuhrkgrwzpwqhgsngi.supabase.co/functions/v1/payments-webhook` with the same secret.

## 2. Code and checks (repository)

- [ ] On `main`, clean tree, CI green.
- [ ] `npm run db:start` then `npm run test:all` passes locally (types, lint, format, source text, unit, Edge Functions, pgTAP, `db:verify`, `security:attack`).
- [ ] Version bumped: `npm version patch --no-git-tag-version` (or `minor` / `major`); the Android versionCode follows (BUILD_ANDROID.md "Versioning").
- [ ] The test APK built and checked on the emulator (`npm run android:test-apk`): sign-in, Discover, a match, chat, Instant on and off, paywall, offline notice, splash in light and dark.

## 3. Android APK

- [ ] Emulator and Docker stopped.
- [ ] `npm run android:release` succeeds (it checks `.env.production` and refuses to run without the production key).
- [ ] The printed signer SHA-256 matches the fingerprint recorded in BUILD_ANDROID.md (same identity as every earlier release).
- [ ] Installed on a real phone over an older SOUL: the update installs without uninstalling (proves the signature matches), sign-in works against the hosted project, no developer menu.
- [ ] Permissions shown in Android settings match BUILD_ANDROID.md "Permissions".

## 4. Website (PWA and `/download`)

- [ ] `public/downloads/` holds the new `soul-<version>.apk` and `latest.json` (the release script copies them).
- [ ] The host has `APP_ENV=production`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or `.env.production` is used for the build).
- [ ] Deploy (owner). Then on the live site: `/download` shows the version, size and SHA-256; the downloaded file's SHA-256 matches; `/install` shows the iPhone steps; the PWA installs from Safari.
- [ ] Response headers on the live site include the CSP from `vercel.json`.

## 5. Tell installed apps

- [ ] Run `dist-android/release.sql` in the Supabase SQL editor **after** the site serves the new APK. Installed apps offer the update; set `min_version_code` only when old builds must stop (for example after a breaking server change).

## 6. After release

- [ ] Record the version, date, SHA-256 and signer fingerprint in BUILD_ANDROID.md "Release history".
- [ ] Watch Supabase logs and the moderation queue for the first day.
- [ ] Keep `dist-android/` (or at least the APK and its SHA-256) for the record; it is git-ignored.
