# SOUL: Security Model

This is the working security model. It will be updated every phase and audited in Phase 19. Nothing here claims legal or regulatory compliance; that needs a separate professional review.

## 1. Core assumptions

1. **Every client is untrusted: the APK and the PWA.** Anyone can decompile the APK, read and modify the web bundle, replay requests, or call Supabase directly with a valid user JWT. Every rule that matters is enforced in Postgres (RLS, constraints, SECURITY DEFINER functions) or in Edge Functions.
2. **A valid session is not trust.** An authenticated user may be malicious. Authorization is always "this user, for this row, for this action", never just "logged in".
3. **Least data.** Anything not stored cannot leak. Raw location, identity documents and selfies are kept only as long as a stated purpose needs them.
4. **Default deny.** Every table has RLS enabled with no policy until an explicit one is written. The `anon` role gets nothing beyond the auth endpoints.

## 2. Trust boundaries

```
[Android APK] ─┐
               ├─(user JWT, publishable key)──> [Supabase API: PostgREST / Realtime / Storage]
[iPhone PWA] ──┘                                      |  RLS + grants decide every row
      |                                               v
      +──(user JWT)──> [Edge Functions] ──(service role, server only)──> [Postgres/PostGIS, Storage]
                               |    ^
                               |    └── signed webhook ── [Payment provider (C-25)]
                               +──> [External: payment provider API, FCM, Web Push]
```

- The **client** holds only the Supabase URL, the publishable key, and the user's own session: Keystore-backed SecureStore on Android (D-006), `localStorage` on the web (D-040, section 12).
- **Edge Functions** hold the service role, the payment provider's API and webhook secrets, FCM credentials and the VAPID private key as Supabase secrets. They verify the caller's JWT, validate input with Zod, then act.
  - The gateway's `verify_jwt` is off (`supabase/config.toml`). Every function starts with `requireUser`, which asks Auth to validate the token, so it works with any JWT signing key and also rejects revoked sessions. It also lets CORS preflights reach the function.
  - CORS allows any origin. Calls carry a bearer token, never cookies, so another site cannot act for a signed-in student. Native apps send no `Origin` header.
- **SECURITY DEFINER SQL functions** run fixed logic with elevated rights. Each one pins `search_path`, checks `auth.uid()`, validates arguments, and is granted only to `authenticated`.

## 3. Data classification

| Class | Examples | Who can read | Storage |
|---|---|---|---|
| Public-to-eligible | display photos (approved), age, hook, About Me, zodiac if shown, verified flag, Hot Person flag | eligible, non-blocked users through discovery and match functions only | `profiles`, `profile_photos`, bucket `profile-photos` (private, signed URLs) |
| Private-self | email, date of birth, preferences, privacy settings, swipe balance, own date progress, purchases | owner only | owner-scoped RLS |
| Restricted | date of birth (private; the public profile shows age only), allowlist config | owner reads own DOB; nobody else | `account_private` (owner read-only), `app_config` (hidden keys) |
| Location-sensitive | the Instant Meet latest position (no history) | the raw position: nobody through the client API; derived values (rounded distance, 15° bearing, `nearby`) only through `instant_state` to the two people of a live session | `private.instant_presence` (private schema: not exposed, no grants; D-050) |
| Safety | reports, report attachments, moderation actions, risk signals | reporter can see their own report status; moderators through admin functions | bucket `report-evidence` (service role only) |
| Operational | audit events, feature flags, plan catalog | catalog readable; flags readable by name only; audit is admin-only | |

## 4. Server-authoritative transitions

The client can request these; only the server decides them. Each is a SECURITY DEFINER function or an Edge Function. No client-writable column can change them.

| Transition | Authority |
|---|---|
| Email domain allowed, OTP issued or verified | Supabase Auth + server allowlist hook |
| SRMIST email verified | Supabase Auth OTP + `before-user-created` domain hook (spec v2: the only verification, D-027). Password sign-ups need confirmation and password sign-ins get no token (custom access token hook); email changes stay inside the allowed domains (D-046) |
| 18+ date of birth | `set_date_of_birth()` (once; under-18 refused and locked, minor's DOB never stored, D-028) |
| Rules/Terms accepted | recorded at sign-up from the ticked version, or `accept_terms()`; the server checks the current version (D-029) |
| Eligibility for the app | `get_my_status()`: email verified + current terms + 18+ DOB + profile complete + account active. **No location involved (spec v2: no geofence)** |
| Instant Meet 1 km candidacy | server-side `ST_DWithin` on `geography` (D-031); the only location use |
| Like, credit consumption, match creation | `swipe_right` transaction under a per-account lock, then a pair lock (D-013, D-015, D-047, D-048); the balance is computed from an append-only ledger; one match row per pair |
| Message stored and delivered | `send_message()` (membership, active match, length, reply target, rate limit, idempotent per device id); a trigger broadcasts it. Clients cannot publish on the chat topic (D-049) |
| Unmatch, anonymous reveal to a match | `unmatch()` (participants only; the pair never sees each other again); `reveal_on_match` applied by the card function and by Storage signing |
| Plan or top-up granted | `activate_plan` (service role only, once per payment key), called by the payment webhook after it verifies the signature and amount |
| Subscription active, top-up granted, refunds | `payments-webhook` after verifying the provider signature and the amount against the server catalog (D-037); idempotent on the provider payment ID |
| Instant entitlement, Instant visibility, session start/end | `instant_start` (plan gate), `instant_candidates`, `instant_accept` (both must accept; one transaction under the pair lock), `instant_end_session` / `instant_stop` (unilateral) and the lazy sweep (expiry) (D-050) |
| Other user's distance and bearing | `instant_state` returns buckets only: 50 m / 100 m distance steps, 15° bearing, only `nearby` under 100 m (D-050) |
| Date confirmed, Hot Person badge | confirmation function + recompute job |
| Photo published and registered | `profile-photos` Edge Function: JPEG structure, real size read from the file, metadata stripped, clean copy written by the server (D-043) |
| Suspension, ban, photo or verification rejection | admin functions with role check + audit log |

**Column-level guard:** status and entitlement columns (`verification_status`, `is_verified`, `plan_id`, `hot_person_active`, `account_state`, and similar) sit in tables or columns with **no client UPDATE grant**. Users edit profile text through a narrow RPC or through policies limited to editable columns.

## 5. RLS principles

- `ALTER TABLE … ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL SECURITY` on every table in exposed schemas.
- Policies use `(select auth.uid())` (cached per statement) and indexed foreign keys.
- **Block-aware helpers:** `is_blocked(a, b)` is checked in the discovery, profile-view, messaging, Instant and presence policies and functions. Blocks are symmetric in effect but stored one-way, and the blocked party is never told.
- **No raw location via RLS:** `private_location_state` has RLS enabled and **zero** policies for `authenticated`/`anon`, so it is readable only by the service role.
- **Discovery never exposes tables directly.** Candidates come from a function that applies eligibility, preferences, blocks and privacy mode (no location, spec v2), and returns a whitelisted projection.
- **Views** are created with `security_invoker = true`, so a view never silently bypasses RLS.
- Every policy has a pgTAP test proving both allow and deny (Phase 17), including cross-account attempts: User A reading User B's location, documents, reports, purchases, hidden profile and block details must all fail.

## 6. Storage

| Bucket | Public | Write | Read |
|---|---|---|---|
| `photo-uploads` (inbox) | no | owner uploads `{uid}/{id}.jpg` and `{uid}/{id}.tiny.jpg` only; JPEG, 3 MB, at most 4 objects waiting | owner (to clean up); emptied by the `profile-photos` function |
| `profile-photos` | no | **server only**: the `profile-photos` Edge Function writes the checked, metadata-free copy (D-043) | owner; other students only via signed URLs that Storage issues when `can_view_photo_object` passes (approved, visible under D-042, not anonymous) |
| `profile-photos-blurred` | no | **server only**: the checked tiny (at most 32 × 40 px) anonymous-mode copy | owner; others via signed URLs under the same rule |
| `report-evidence` | no | via report function | service role only |
| `chat-media` (feature-flagged) | no | conversation members, after moderation | conversation members via signed URLs |

Photos are re-encoded on the device (crop, resize, JPEG), but that is only a convenience: a tampered app could skip it. The server check is the one that counts (D-043):
- The `profile-photos` Edge Function reads the upload from the inbox and refuses anything that is not a well-formed JPEG (baseline or progressive, 8-bit, 1 or 3 components).
- It reads the real width and height from the file (the app's numbers are not used), requires portrait 4:5 from 200 to 1080 px wide, and a tiny copy of at most 32 × 40 px.
- It rebuilds the file from the decoding segments only. EXIF (GPS, camera serials), XMP, ICC, comments, thumbnails and any bytes after the end marker are dropped. Pixels are unchanged.
- It writes the clean copies itself, registers the photo (`add_profile_photo`, service role only) and empties the inbox.
- Clients cannot write or delete published objects, so a registered photo cannot be swapped later. Removal also goes through the function.

Automated face, lighting and one-subject checks are C-30 (Phase 13, with the review queue).

## 7. Abuse and attack controls

| Threat | Control |
|---|---|
| Account enumeration | identical auth responses; no public search by name (spec 17); discovery only via server functions |
| OTP brute force | 6-digit email OTP, 10-minute expiry, single use (replay rejected, tested), 60 s resend window, Auth verification rate limits per IP; production limits set in the dashboard |
| Non-SRMIST sign-up | Auth `before-user-created` hook against the server-side allowlist; rejects gmail, look-alike suffixes and unlisted subdomains (tested). Clients cannot bypass it |
| Duplicate accounts | one account per verified SRMIST email (a mailbox proves identity, D-027); device signals; report-driven review |
| Replay | idempotency keys on swipes, purchases and confirmations; provider payment and order IDs unique; webhook events processed once; nonces on sensitive Edge calls |
| Client entitlement tampering | no client-writable entitlement or balance; balance computed from the ledger |
| Fake purchase state | only a signed provider webhook grants (the success redirect grants nothing); amount and currency checked against the server catalog; the mock provider is refused in production |
| Swipe or match races | row lock on the entitlement row + pair advisory lock + unique constraints; pgTAP concurrency tests |
| Message spam | per-conversation and per-user rate limits in the send function; new-match first-message throttle |
| Upload abuse | size and type limits, per-day caps, moderation queue before public visibility |
| Location leakage | Location exists only in Instant Meet (D-030); no raw coordinates to clients; 1 km server-side candidacy; bucketed distance; arrow suppressed under 100 m; deleted when Instant ends. Phase 10 leak audit done: pgTAP and HTTP checks that positions are unreadable and that no function output contains a coordinate (D-050); repeated in Phase 18 |
| Location spoofing and probing | a fake position cannot locate anyone precisely: the 1 km test uses a ~110 m grid, one position every 2 s, impossible jumps refused (D-050). Risk signals (D-023), manual review, never single-signal bans (Phases 13 and 18) |
| Direct object access | UUID keys, RLS on every table, signed URLs with short TTL, no guessable public paths |
| Service-role exposure | never in the app bundle, the web bundle or `EXPO_PUBLIC_*`; a CI grep plus an APK and `dist/` string scan in Phase 18 |
| Token theft on the web | strict CSP, no third-party scripts, no `dangerouslySetInnerHTML`, short-lived access tokens (section 12) |
| Tampered APK download | HTTPS only, SHA-256 published on `/download`, the same signing key for every version so Android refuses a mismatched update (D-039, C-20) |
| Stalking via Instant | mutual acceptance before any proximity; one acceptance is invisible to the other person; unilateral End Meet always on screen; session expiry; a block ends the session at once; positions deleted at the end (D-050) |
| Admin abuse | role table checked server-side; every admin action writes `moderation_actions` + `audit_events` |

## 8. Realtime

Private channels only, authorized by RLS on `realtime.messages` (D-012, built in Phase 9 as D-049): `chat:<conversation>` and `user:<account>` are server-to-client, and `typing:<conversation>` is the only topic a client may publish on. "Allow public access" must be off in the hosted Realtime settings (SUPABASE.md). Topic names include IDs that the policy checks against membership plus not-blocked. Presence payloads contain only a typing flag and user ID, never location. Instant proximity updates are **not** broadcast at all: each client re-reads `instant_state` (server-computed buckets for its own session), and the server only nudges `user:<account>` when a session starts or ends. The session chat uses the same `chat:` and `typing:` topics, authorized while the session is live (D-050).

**Known limitation:** Realtime re-authorizes on join and token refresh. After a block, the server immediately stops writing to the channel and sends a revoke event. A tampered client could keep an idle socket open until its next token refresh, but it would receive nothing further because no new messages are written for that pair.

## 9. Secrets and configuration

- `.env*` files are git-ignored. `app.config.ts` exposes only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `APP_ENV`.
- Edge Function secrets are set with `supabase secrets set`, one set per project (dev and prod).
- Release signing keys stay with the owner and are never committed.
- The mock payment provider is compiled out of release builds **and** refused by the server in production.

## 10. Logging

Logs never contain message bodies, coordinates, ID data, face images, OTPs, tokens, or About Me text. Errors are logged with IDs and codes only. Audit events record actor, action, target and timestamp.

## 11. Verification of this model

- Phase 3: RLS framework + first pgTAP deny tests.
- Phase 10: location-leak audit done (D-050): `011_instant_meet.test.sql` and `db:verify` prove no client access to positions, acceptances or sessions, no coordinate in any Instant output, nothing before both accept, and End Meet revoking everything; verified on Android and the PWA build in the browser.
- Phase 16: full RLS, constraint and race test suites.
- Phase 18: security audit with the `soul-audit` plugin (enable it for that phase), plus manual cross-account attack attempts listed in spec Phase 19.

## 12. Web (iPhone PWA) specifics (D-040)

- **Session:** the web has no keystore, so the Supabase session lives in `localStorage`. The main threat is XSS, so: no third-party scripts or analytics, no `dangerouslySetInnerHTML`, short-lived access tokens with refresh, and this Content-Security-Policy set by the host (`<supabase>` is the project origin):

  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  font-src 'self'; img-src 'self' data: blob: https://<supabase>;
  connect-src 'self' https://<supabase> wss://<supabase>; worker-src 'self';
  manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
  ```

  `style-src 'unsafe-inline'` is required because react-native-web injects its styles at runtime; scripts stay `'self'` only (checked 2026-09-27: the bundle's `eval` sits in unused split-bundle and Node paths, and one `new Function` feature test is wrapped in `try`). The payment provider's checkout origin is added to `connect-src`/`form-action` when C-25 is chosen.
- **Service worker:** caches only the static app shell (hashed JS and CSS, fonts, icons, logo). It never caches `/auth/`, `/rest/`, `/storage/`, `/realtime/` or `/functions/` traffic, any cross-origin request, or any non-GET request. Sign-out clears the session from storage; nothing private remains in caches.
- **Transport:** HTTPS only (HSTS), which geolocation, the service worker and install all require.
- **Capabilities:** location and heading are requested only inside Instant Meet, from a user gesture. When heading is unavailable, the app says so and keeps distance, chat, timer and End Meet (no fallback that guesses direction).
- **Device integrity:** unavailable on the web; risk decisions rely on server-side signals only, never on the client's claims.
