# SOUL: Security Audit (Phase 18)

Spec section 72. Done on 2026-10-03 against the local stack (the same migrations, functions and settings the hosted project runs), with the rules in SECURITY_MODEL.md as the yardstick. Decision record: DECISIONS D-057.

## How it was checked

| Method | Command | What it does |
|---|---|---|
| Cross-account attack | `npm run security:attack` | User A, an ordinary signed-in student, goes after User B's private data with every route the app's own credentials reach: direct table reads, the private and auth schemas, GraphQL, every RPC given B's ids, Storage, Realtime topics and the Edge Functions. 11 checks, each with B's data really present (a match and chat, an order, a report, a push device, a live Instant position, a confirmed date). |
| Database rules | `npm run db:test` | 689 pgTAP assertions in 18 files, including `017_structure` (forced RLS, no anonymous access, no client table writes, pinned search paths, a closed private schema, across the whole schema) and the new `018_text_safety` |
| Server over HTTP | `npm run db:verify` | 110 end-to-end checks through Auth, PostgREST, Realtime, Storage and the Edge Functions |
| Code review | | every migration's security-definer functions, all 11 Edge Functions, `supabase/config.toml`, `vercel.json`, the app's storage and logging |
| Secrets | `git grep` and `git log -p` | private keys, Razorpay, Google, GitHub and JWT patterns across the tree and the whole history |
| Bundles | `npx expo export -p web -p android` | the web bundle and the Android Hermes bundle searched for every server secret's **value** (service role key, secret key, JWT secret, S3 secret, VAPID private key, webhook secret) and for secret names |
| Source text | `npm run text:check` | no invisible control or bidi character in any tracked text file ("Trojan Source") |

All of these run in `npm run test:all` and in CI on every push.

## Proof: User A cannot reach User B's private data

| B's private data | Where it lives | What A tried | Result |
|---|---|---|---|
| **Raw coordinates** | `private.instant_presence`, a schema the API does not expose | REST read of the table (406, schema not exposed); every Instant function's output while B was a **live candidate 20 m away**, searched for any coordinate digit or coordinate field | Nothing. A sees B as "within 1 km" with no number, distance or bearing until both accept; then only a rounded distance and a 15° bearing, and "nearby" under 100 m. Positions are deleted when Instant ends (pgTAP `011`) |
| **Identity documents** | none: SOUL stores no ID documents | | Verification is the SRMIST mailbox plus a 6-digit code, and age is self-declared (owner rule). There is no document to leak |
| **Billing** | `payment_orders`, the plan and like ledgers | table reads; `get_payment` with B's order; `payments-sync` with B's order id | Nothing: RLS is owner-only, the RPC answers "not found", the function returns no orders |
| **Reports** | `reports` | table read; reports are visible to moderators only | Nothing. The reported person is never told who reported them |
| **Verification details** | `account_private` (SRMIST code date, birth date, rules version) | table read, filtered to B; an update of A's own verification | Nothing readable; the update is refused (42501). Moderators see an age, never a birth date |
| Chat, matches, devices | `messages`, `matches`, `push_devices` | table reads; `get_messages`, `send_message`, `mark_conversation_read`, `unmatch` on B's chat; joining `user:B` and `chat:<B's chat>` | Refused or empty; nothing was written into B's chat; the Realtime joins fail while B's own join succeeds (a control, so a refusal is a refusal and not an outage) |
| Profile of a hidden person | `profiles` | `get_profile_card` for B in private mode | No card |
| Escalation | | granting A a role, a plan, editing B's profile | All refused |

## Spec 72, item by item

| Item | Finding | Evidence |
|---|---|---|
| Supabase RLS | Forced on every table, owner-only reads, no client writes except A's own profile and preference columns; everything else goes through checked functions | `017_structure`, attack check 1 |
| Storage | Private buckets, owner-only folders, JPEG-only with size limits, an anonymous person's original photo refused to others | attack check 7, pgTAP `005`, `006` |
| SRM email verification | Sign-up only for listed SRMIST domains, decided by an Auth hook on the server | pgTAP `002`, `007` |
| OTP | 6 digits, 10-minute expiry, single use, 60 s resend window, per-IP limits; a password sign-in is refused a session, so the code is the only way in | `db:verify`, D-046; see F-5 |
| Verification documents | None stored | |
| Billing | Only a signed provider webhook grants a plan; the mock provider now needs an explicit development deployment | pgTAP `013`, attack checks 4 and 8; F-2 |
| Chat privacy | Members only, private Realtime topics, blocks end everything at once | pgTAP `010`, attack checks 4 and 9 |
| Anonymous mode | No name and only blurred photos before a match; originals refused | pgTAP `005`, `009` |
| Instant coordinates | Never sent to anyone, including the owner of the position | attack check 6, pgTAP `011` |
| Instant functions | Plan required, mutual acceptance, one position every 2 s, impossible jumps refused | pgTAP `011`, `db:verify` |
| Location cleanup | Positions deleted on End Meet, expiry, block, suspension and Instant being switched off | pgTAP `011`, `016` |
| Secrets | None in the tree, the history, or either bundle; the only key in the app is the public (anon) key, by design | this audit |
| Edge Functions | Each checks its caller in code: the signed-in user (`requireUser`), a provider signature (webhook) or nothing to give away (`push-send`, which takes no input) | code review; F-4 |
| Service roles | The service key exists only in Edge Function secrets; service-only database functions refuse the app | `017_structure` |
| Abuse cases | 15 messages per 10 s per sender, 10 reports a day, 6 photos of 3 MB, 10 push devices, idempotent swipes, payments and confirmations, a 1 km candidacy on a ~110 m grid | SECURITY_MODEL section 7 |

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| F-1 | Medium | **Text could be stored with bidi overrides or control characters**: a name, hook, About me, message, report or appeal could carry a right-to-left override (U+202E) or isolate, so it reads differently from what was typed ("Test User 01" with a reversed tail, a message whose words appear in another order), or control characters that break layouts. | **Fixed.** The database refuses them (`20261003000800_text_safety.sql`); the app removes them before saving, so pasted text never fails (`src/lib/text.ts`). Directional marks and the emoji joiner stay allowed. pgTAP `018` (17), attack check 11 |
| F-2 | Low | **The mock payment provider failed open**: it was off only when `SOUL_ENV` was exactly `production`, so a hosted deployment with `PAYMENTS_PROVIDER=mock` and no `SOUL_ENV` would have run it. The database still refused mock orders there (`payments_allow_mock` is set only by the local seed), so no free plan was possible. | **Fixed:** the mock now needs `SOUL_ENV=development`; anything else, including unset, keeps it off |
| F-3 | Low | `push-send` logged a delivery error's message, which can include the push endpoint URL. | **Fixed:** the error name only, like every other function |
| F-4 | Low | `push-send` can be called by anyone. It takes no input and only delivers what the server already queued, each at most once, so a caller can cost function invocations but cannot send or read anything. | Accepted (D-054). If abused, the hosted function can require a shared header set by the database ping |
| F-5 | Low | OTP guessing limits are **per IP**. With 6 digits and a 10-minute expiry, an attacker with many addresses could make thousands of guesses per code. | Accepted for launch with the hosted limits (SUPABASE.md). If abuse appears, turn on Auth CAPTCHA (Turnstile) or move to 8-digit codes; both are configuration plus a small UI change |
| F-6 | Low | Signing up with a **banned** address says "This email can't be used for SOUL." Someone who already knows a classmate's exact SRMIST email could infer that account was removed. | Accepted: no reason is given, and the person needs to be told something; pretending to send a code would leave a wrongly banned person with no way to ask |
| F-7 | Info | SECURITY_MODEL.md listed three controls that were never built: a first-message throttle for new matches, per-day upload caps and nonces on Edge calls. | **Corrected** to what exists (15 messages per 10 s, 6 photos of 3 MB, idempotency keys). None was needed for a guarantee above |
| F-8 | Info | EAS's `credentials.json` (it can hold keystore passwords) was not git-ignored. No keystore exists yet. | **Fixed:** ignored, with `credentials/` |
| F-9 | Info | Nothing stopped invisible characters in the code itself. | **Added** `npm run text:check` (CI and `test:all`). The 352 existing files had none; it caught such characters in this phase's own new test files before commit, which now build them from code points |
| F-10 | Info | Edge Functions answer CORS with `*`. | Safe: they authenticate by bearer token, never cookies |
| F-11 | Low | **A refused Realtime topic slowed every other topic on the same socket.** A channel the server refuses keeps retrying its join, and while it does, server broadcasts to that socket's other topics arrive only at the next retry: measured 4.6 to 4.7 s instead of about 55 ms. In the app, a chat left open on a conversation that had ended would have held back match, message and Instant updates by up to 10 s. It also made one `db:verify` check fail in CI on two runs (Phases 17 and 18). | **Fixed:** the chat screen leaves its topics once the conversation is closed or unavailable (unit tests); `db:verify` drops refused probe channels and reports the join state. Not a data leak: refused topics never received anything |
| F-12 | Low | **A local preview of the production website talked to the hosted project.** Since `.env.production` exists (Phase 20), `npm run web:export` bundles the hosted URL, which is right for hosting; but PWA.md said to test that `dist/` locally with `expo serve`, so anything tried in the preview reached the hosted servers. Found on 2026-10-05 when one sign-in code request for a test address (`POST /auth/v1/otp`) went to the hosted project; nothing else was sent. Exporting with `.env` values in the shell did not help: Expo re-reads the env files while bundling and `.env.production` wins. | **Fixed:** `npm run web:preview` builds from `.env` alone (`EXPO_NO_DOTENV=1`), refuses to serve a bundle naming the hosted project, and serves with the host's rewrite; PWA.md and README point to it. The Android test APK was checked and carries only the local address |
| F-13 | Low | `npm audit --omit=dev` reports 57 advisories from four packages. `braces`, `node-forge` and `uuid` come only through build tooling (Metro, Expo CLI, config plugins) and never ship in the app. `decode-uri-component` 0.2.2 ships inside `expo-router` (through `query-string` 7): a malformed link can make URL decoding slow, which could hang the app that opened it, never the server or another account. | Accepted until SDK 58: the patched version (0.5) is ESM only and `query-string` 7 `require`s it, so an override would break routing; `expo-router` 58 carries the fix. SDK 57 patch releases are installed (`npx expo install --check` clean) |

Nothing found reached another person's private data.

## Checked and fine

- **Web:** strict CSP (scripts `'self'` only, no inline script in the exported page, `frame-ancestors 'none'`), HSTS, `nosniff`, `X-Frame-Options: DENY`; the service worker caches only the static shell.
- **Android:** `allowBackup` off; the session in the Keystore-backed SecureStore; no `console` logging anywhere in the app.
- **Logs:** functions log error names only, never bodies, tokens or positions.
- **Realtime:** the known limitation in SECURITY_MODEL section 8 (an idle tampered socket after a block receives nothing new) stands.

## Before the hosted launch (owner settings, not code)

- `SOUL_ENV=production` and `PAYMENTS_PROVIDER=razorpay` as Edge Function secrets (SUPABASE.md).
- Auth: email OTP length 6 and expiry 600 s, rate limits no looser than `supabase/config.toml`, custom SMTP, sign-ups through the hook.
- Realtime: "Allow public access" off.
- The FCM service account only in Edge Function secrets (C-16), never in chat or the repository.
- Re-run the bundle scan on the release APK and the deployed `dist/` (Phase 20 checklist).
