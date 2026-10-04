# SOUL: Testing

How SOUL is tested, what each layer covers, and where every item of spec section 70 is checked (Phase 16, DECISIONS D-056).

## Run everything

```bash
npm run db:start      # local Supabase (Docker), once
npm run test:all      # types, lint, format, source text, unit tests, Edge Functions, pgTAP, HTTP checks, attacks
```

`npm run test:all -- --no-db` skips the three database steps. GitHub Actions (`.github/workflows/ci.yml`) runs the same steps on every push to `main`, with no secrets: a throwaway local stack, the mock payment provider and freshly generated Web Push keys.

**CI notes:**
- The Edge Function check runs with `--node-modules-dir=none`: the functions resolve their own `npm:` imports, as the hosted runtime does, and CI does not install the app's `node_modules` for that job.
- A failed `db:verify` or `security:attack` check (or a crash) is printed as a GitHub annotation, so it can be read without signing in to open the log.
- `db:verify` failed intermittently in CI (Phase 16, and the Phase 17 and 18 pushes) on "the phone is told at once" after a payment. Cause (Phase 18, SECURITY_AUDIT F-11): refused Realtime probe channels kept retrying on the buyer's socket, and that delays the socket's other broadcasts by up to 10 s. Refused probes are now dropped at once, and the check reports the join state.

## Layers

| Layer | Command | Size | What it proves |
|---|---|---|---|
| Types and lint | `npm run typecheck`, `npm run lint` | whole repo | strict TypeScript; hex colours only in `src/theme` |
| Source text | `npm run text:check` | every tracked text file | no invisible control or bidi characters in code, SQL or docs (D-057) |
| Unit tests (Jest) | `npm test` | 202 tests, 28 files | app models (pricing, badges, Instant buckets, chat grouping, payments, safety, admin, notification links) and the Edge Function libraries in `supabase/functions/_shared` (JPEG stripping, Razorpay signatures, **Web Push RFC 8291 test vector**, VAPID, FCM assertions) |
| Edge Functions | `npm run functions:check` | 11 functions | every function type-checks under Deno |
| Database (pgTAP) | `npm run db:test` | **695 assertions, 19 files** | every rule enforced by the database, run as the real `authenticated` and `service_role` roles inside a rolled-back transaction |
| Server over HTTP | `npm run db:verify` | **110 checks** | the real stack end to end: Auth with OTP email, PostgREST, Realtime sockets, Storage, Edge Functions |
| Cross-account attacks | `npm run security:attack` | **11 checks** | an ordinary student attacks another account's coordinates, billing, reports, verification details, chat, storage and topics through every route the app's credentials reach (Phase 18, SECURITY_AUDIT.md) |
| Devices | per phase, PHASE_PLAN "Verified" | | the Android emulator (development build, and from Phase 19 the release-optimised test APK) and an iPhone-size web viewport, plus the cross-platform matrix in PLATFORM_MATRIX.md |
| Environment files | `npm run env:check -- development\|production` | every env file | the app files hold no secret, the server files are complete and well-formed (D-059) |

**End to end:** E2E_ACCEPTANCE.md records a full walkthrough of the app on the release-optimised test APK (D-060).

**Local Realtime quirk:** the local Realtime server periodically "rebalances" its tenant (it finds no node for the tenant's region), stops streaming database broadcasts for a few minutes and drops what is sent meanwhile. A Realtime check that times out right after such a restart is that, not the app; the app re-checks every waiting state anyway (D-060).

**Fixture rules:** neutral identities only (`Test User 01`, `Profile 07`); each pgTAP file creates its own accounts with a fixed id prefix and counts **only its own fixtures** (a shared local database once broke two tests that assumed it was empty); every pgTAP file rolls back.

## Spec section 70, item by item

| Spec 70 item | Database (pgTAP) | Over HTTP (`db:verify`) | On devices |
|---|---|---|---|
| Auth | `002` sign-up and status, `003` rules version at sign-up, `007` hooks (no passwords, code sessions only) | real Auth: OTP delivered, wrong code refused, right code signs in, replay refused, password sign-in refused | Phase 4: rules → email → code → age on Android and web |
| SRMIST domain rules | `002`, `007` (email changes stay inside the domain) | gmail and look-alike domains refused at sign-up | Phase 4 |
| RLS | `001` foundation; every feature file starts with "no client access"; **`017` structure: forced RLS on every table, no anonymous access, no direct writes, pinned search paths, private schema closed, no public buckets** | self-verification denied, cross-account reads denied, anonymous denied | |
| Profile privacy | `004` profile, `005` discovery visibility (16 accounts), `006` photos, `009` anonymous reveal | Storage signing refused for private and anonymous originals | Phase 5 and 6 |
| Swipes | `008` free likes once, charging, replays, passes free, expiry | 7 parallel likes with 3 left charge exactly 3 | Phase 7 |
| Subscription entitlement | `008`, `013` (only a signed payment grants; refunds revoke) | the app cannot activate a plan; a client-sent price is ignored | Phase 7 and 12 |
| Match races | `009` one row per pair | two people liking each other at the same moment make exactly one match, charged once each | Phase 8 |
| Chat | `010` sending, limits, topics, receipts, rate limit | real sockets: outsiders refused, forged broadcasts dropped, typing and receipts | Phase 9 and 16: Android ↔ web live both ways, read receipts |
| Blocking | `014` block effects, invisibility, unblock | a block hides both people and the blocked one cannot see it | Phase 13; Phase 16: a web block ends the Android chat live |
| Instant ≤ 1 km | `011` candidates at 0.9 km | 200 m is a candidate | Phase 10 on Android and web |
| Instant > 1 km rejection | `011` 1.4 km is not | 1.4 km is not a candidate | Phase 10 |
| Raw-location protection | `011` positions unreadable, no coordinate in any output, the grid hides the exact boundary, jump and rate checks | no coordinate or distance in candidates; positions unreadable | Phase 10 leak audit |
| Instant termination | `011` End Meet, Turn off, expiry, block | End Meet closes everything for both and the chat topic is refused afterwards | Phase 10 |
| Badge logic | `012` the 30-day window, distinct partners, cooldowns, moderation | a first yes invisible, the second confirms, no double count | Phase 11 |
| Billing | `013` frozen prices, mismatches, refunds, order limits | unsigned or wrongly signed webhooks refused; a signed payment grants once; sync; refunds revoke | Phase 12 on the mock provider |
| Account deletion | `014` withdrawal, retained records | deletion needs confirmation, removes the account and ends its sessions | Phase 13 |
| *(also)* Push | `015` | VAPID key, push-service allowlist, server-only registration | Phase 14: real Web Push on the emulator |
| *(also)* Admin | `016` | roles enforced, appeals | Phase 15 on Android and web |

## Not covered yet (and why)

- **Android push delivery through FCM:** waits for the owner's Firebase service account (C-16). Web Push is tested for real.
- **Live Razorpay:** waits for the owner's test keys and webhook (C-25); the mock provider signs events for the real webhook.
- **A real iPhone:** the PWA is tested in an iPhone-size viewport and in Chrome on Android, not yet in Safari on an iPhone (Phase 17 visual QA and the release checklist).
- **One Android and one PWA in the same Instant Meet:** each platform has been tested with a scripted or browser partner, not with each other.
- **Performance on a real low-end phone:** the Phase 19 measurements (PERFORMANCE.md) were taken on the emulator with the release-optimised test APK; frame times and start-up on a slow real phone stay on the release checklist.
- **The production APK on a real phone:** needs the owner's signing key (C-20); the test APK covers the same release build on the emulator.
