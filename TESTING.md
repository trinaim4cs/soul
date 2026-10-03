# SOUL: Testing

How SOUL is tested, what each layer covers, and where every item of spec section 70 is checked (Phase 16, DECISIONS D-056).

## Run everything

```bash
npm run db:start      # local Supabase (Docker), once
npm run test:all      # types, lint, format, unit tests, Edge Functions, pgTAP, HTTP checks
```

`npm run test:all -- --no-db` skips the two database steps. GitHub Actions (`.github/workflows/ci.yml`) runs the same steps on every push to `main`, with no secrets: a throwaway local stack, the mock payment provider and freshly generated Web Push keys.

**CI notes:**
- The Edge Function check runs with `--node-modules-dir=none`: the functions resolve their own `npm:` imports, as the hosted runtime does, and CI does not install the app's `node_modules` for that job.
- A failed `db:verify` check (or a crash) is printed as a GitHub annotation, so it can be read without signing in to open the log.
- One early run failed in `db:verify` before annotations existed, and the next runs passed, so it was intermittent and its check is unknown. If it returns, the annotation names it.

## Layers

| Layer | Command | Size | What it proves |
|---|---|---|---|
| Types and lint | `npm run typecheck`, `npm run lint` | whole repo | strict TypeScript; hex colours only in `src/theme` |
| Unit tests (Jest) | `npm test` | 185 tests, 24 files | app models (pricing, badges, Instant buckets, chat grouping, payments, safety, admin, notification links) and the Edge Function libraries in `supabase/functions/_shared` (JPEG stripping, Razorpay signatures, **Web Push RFC 8291 test vector**, VAPID, FCM assertions) |
| Edge Functions | `npm run functions:check` | 11 functions | every function type-checks under Deno |
| Database (pgTAP) | `npm run db:test` | **672 assertions, 17 files** | every rule enforced by the database, run as the real `authenticated` and `service_role` roles inside a rolled-back transaction |
| Server over HTTP | `npm run db:verify` | **109 checks** | the real stack end to end: Auth with OTP email, PostgREST, Realtime sockets, Storage, Edge Functions |
| Devices | per phase, PHASE_PLAN "Verified" | | the Android emulator (development build) and an iPhone-size web viewport, plus the cross-platform matrix in PLATFORM_MATRIX.md |

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
- **Performance and the security audit:** Phases 18 and 19.
