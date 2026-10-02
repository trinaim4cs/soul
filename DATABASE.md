# SOUL: Database

Postgres 17 + PostGIS on Supabase. All changes go through migrations in `supabase/migrations` (never by hand). The security rules are in `SECURITY_MODEL.md`.

## Schemas

| Schema | Exposed via API | Contents |
|---|---|---|
| `public` | yes (RLS on every table, forced) | account and profile data, config, audit |
| `private` | **no** | security helpers and trigger functions; future restricted tables (Instant Meet private location state) |
| `auth`, `storage` | managed by Supabase | users, sessions, storage objects |

## Tables (Phases 3, 5, 6, 7 and 8)

| Table | Client access | Notes |
|---|---|---|
| `account_private` | owner **read** only | account state; SRMIST email verified time (from OTP); accepted terms version; self-declared date of birth (18+ check constraint, set once via `set_date_of_birth`); under-18 lock time; profile-complete time. Written only by server functions and triggers |
| `profiles` | owner read; owner **update of editable columns only** (`display_name` 1 to 30, `hook` ≤ 30, `about` ≤ 1000, `gender`, `zodiac_visible`, `privacy_mode`) | other users will only ever see projections from discovery and match functions |
| `preferences` | owner read; owner update of `show_me`, `min_age`, `max_age`, `zodiac_filter` | private "who I want to see" and discovery filters; 18+ enforced by a check; created for every account |
| `likes` | liker reads own rows | written only by `swipe_right`; one per pair; unique idempotency key |
| `matches` | none | one row per ordered pair (unique); written only by `swipe_right`, `mark_match_seen` and `unmatch`; unmatching keeps the row, inactive |
| `plans` | signed-in users read active rows | the catalog (D-047): price in paise, right swipes, period, Instant inclusion; a top-up can never include Instant |
| `subscriptions` | none | one row per bought plan period; unique `source_key` (the payment) |
| `swipe_credit_ledger` | none | append-only (trigger); `grant` rows are lots with a validity window, other rows draw from a lot; unique idempotency key |
| `private.free_swipe_claims` | none (private schema) | fingerprint of each address that has had its free swipes |
| `passes` | passer reads own rows | written only by `swipe_left`; `passed_at` drives the 30-day cooldown |
| `profile_photos` | owner **read** only | rows are written only by `add_profile_photo` and `remove_profile_photo` (service role, via the `profile-photos` Edge Function) and `reorder_profile_photos`; `status` pending/approved/rejected; positions 0 to 5 (unique, deferred); paths must be the owner's own `{uid}/{id}.jpg` |
| `blocks` | blocker reads own rows | stored one-way, effective both ways (`private.is_blocked`); created only by server functions |
| `admin_roles` | none | checked by `private.has_admin_role` |
| `feature_flags` | read | server-managed |
| `app_config` | read `client_visible` keys only | required rows live in a migration: `allowed_email_domains` (hidden; also readable by the Auth hook), `current_terms_version`, `free_right_swipes` (4, one-time), `instant_radius_meters` (1000, hidden) |
| `audit_events` | none | append-only, written by server functions |

Enums: `account_state`, `privacy_mode` (normal, private, anonymous), `admin_role`, `gender` (woman, man, non_binary), `photo_status` (pending, approved, rejected). (No zones: spec v2 has no geofence.)

## Functions and triggers

- `on_auth_user_created` creates `account_private` and `profiles` rows for every new user.
- `on_auth_user_email_confirmed` mirrors the OTP-verified email into `account_private.institutional_email_verified_at`.
- `public.hook_before_user_created(event)` is the Auth hook (`supabase_auth_admin` only). It rejects any email whose domain is not in `allowed_email_domains`.
- `public.hook_custom_access_token(event)` (`supabase_auth_admin` only) refuses tokens from a password sign-in (D-046).
- Trigger `guard_auth_email_change` on `auth.users` refuses an email, or a requested email change, outside the allowed domains (`private.email_domain_allowed`).
- `public.accept_terms(version)`, only the current version accepted.
- `public.set_date_of_birth(date)`: once, 18+, under-18 refused and locked for 30 days without storing the date, zodiac derived via `private.zodiac_for`.
- `public.get_my_status()` (authenticated only) returns `eligibility`, `account_state`, steps `{email, terms, age, profile}`, `age_locked` and `current_terms_version`. The app routes on it.
- `on_auth_user_created` also records the rules version ticked before sign-in (from sign-up metadata), current version only.
- `public.add_profile_photo(user, id, width, height, source)`: **service role only** (D-043). Registers a photo only when both published objects exist in that user's folders; applies the photo limit and the review flag. Width and height come from the file, read by the Edge Function.
- `public.remove_profile_photo(user, id)`: **service role only**. A completed profile keeps at least one photo; returns the object names, which the Edge Function deletes.
- `public.reorder_profile_photos(ids)`: the full set in the new order; the first becomes the main photo.
- `public.submit_profile()`: checks the earlier steps and the required fields (photo, name, gender, show me, hook) and marks the profile step complete, or returns the missing fields.
- `public.discovery_feed(exclude, limit)`: the next candidates as whitelisted cards (D-042); `not_eligible` for accounts that are not.
- `public.get_profile_card(target)`: one card, only if the caller may see it.
- `public.swipe_right(target, idempotency_key)` / `public.swipe_left(target)`: like and pass, re-checking visibility. A like is metered (D-047): one transaction under the account's credit lock, one credit per new like, `no_swipes` when there are none, and the new balance in the answer.
- `public.get_my_matches()` / `public.get_match(id)`: the caller's active matches as whitelisted cards, with their own seen flag.
- `public.mark_match_seen(id)` / `public.unmatch(id)`: participants only.
- `private.lock_pair`, `private.active_match`, `private.can_view_match`, `private.unseen_match`, and `private.profile_card(uid, for_match)` (the reveal rule for anonymous people, D-048).
- `public.get_my_swipes()`: the caller's balance, per-source split, current plan and Instant entitlement; makes the one-time free grant.
- `public.activate_plan(user, plan, key)`: **service role only**. Grants a plan period or a top-up exactly once per payment key.
- `private.swipe_lots`, `private.swipe_balance`, `private.ensure_free_swipes`, `private.lock_swipes`: balance and locking helpers.
- `private.is_eligible(uid)`, `private.can_view_profile(viewer, candidate)`, `private.profile_card(uid)`, `private.can_view_photo_object(bucket, name)` (the last is the only private function callable by `authenticated`, because Storage policies run as the caller).
- `public.get_my_profile()`: the owner's own profile with derived age and zodiac, never the date of birth.
- `private.is_blocked(a, b)` and `private.has_admin_role(uid, minimum)` are SECURITY DEFINER with a pinned `search_path` and are not executable by API roles.

## Storage

Five private buckets: `photo-uploads` (the app's inbox: owner inserts `{uid}/{id}.jpg` and `.tiny.jpg` only, at most 4 waiting, JPEG, 3 MB), `profile-photos` and `profile-photos-blurred` (written only by the `profile-photos` Edge Function; the owner reads `{uid}/…`), `report-evidence` and `chat-media` (no client policies). Other students can sign (and so read) a photo only when `private.can_view_photo_object` allows it: approved, and visible to them under D-042 or as an active match (D-048). An anonymous person's originals are signed only for a match, and only if they allow the reveal; otherwise only the blurred copy.

## Tests

- `supabase/tests/database/*.test.sql` (pgTAP): **239 assertions pass across 9 files** (Phase 8 adds 46 in `009`: one-sided likes, the matching like, replays, one row per pair, seen state per person, outsiders refused, matches surviving filter changes, the anonymous reveal on and off including Storage signing, blocked and suspended matches hidden, unmatch and no rematch) (Phase 7 adds 45 in `008`: catalog values, no client grants, free swipes once per address, charging, replays, passes free, `no_swipes`, plan expiry, overlapping plans, Instant by plan, append-only ledger, config-driven free quantity) (auth hardening adds 14 in `007`: the domain check, the token hook refusing passwords and keeping code sessions, email changes kept inside the allowed domains) (photo intake adds 15 in `006` plus 4 in `004`: no direct publishing, inbox names and folders, the inbox cap, published photos cannot be deleted or swapped, the photo functions are service-only) (Phase 6 adds 38: every visibility rule with 16 fixture accounts, anonymous cards, likes and passes, idempotency, cooldown, zodiac inference, Storage reads) (Phase 5 adds 27: photo registration and limits, no self-approval, review flag, reorder and removal rules, completion, derived age and zodiac, cross-account isolation), including the SRMIST domain gate, terms versions, 18+ with lockout, and terms recorded at sign-up. The foundation file covers RLS forced everywhere, provisioning, anon denial, own-row-only reads, blocked self-verification, blocked account-state changes, column-limited profile edits, cross-account update isolation, unreadable server tables, hidden config, incomplete default status, and no public buckets.
- `npm run db:verify` runs an end-to-end HTTP check against the local stack: **56/56 pass** (Phase 8: simultaneous mutual likes make exactly one match per pair, announced to one request, charged once each; unmatch hides both ways) (Phase 7 races over real HTTP: 7 parallel likes with 3 swipes left charge exactly 3; 10 parallel requests for 2 people cost exactly 2; the app cannot activate a plan) (auth hardening: a password sign-up gets no session and is not verified, password sign-in is refused, an account cannot move to gmail) (photo intake: direct publishing refused, EXIF/GPS/XMP/ICC/comment/trailing bytes stripped, size read from the file, non-JPEG, wrong shape and oversized tiny copies refused, the inbox emptied, published photos cannot be deleted by the app, removal deletes both files, CORS preflight) (Phase 6 adds photo upload and registration, cross-folder upload refused, the feed, Storage signing for a visible profile, refusal for signed-out, private and anonymous originals, and a like). With the real Auth service, gmail and look-alike domains are refused, the OTP email is delivered, wrong codes are rejected, the correct code signs in and marks email verified, and replay is rejected. It covers the RPC via PostgREST, self-verification denied (42501), cross-account read denied, own hook edit, anon denied, and the Edge Function authenticated (200) and unauthenticated (401).

## Workflow

```bash
npm run db:start     # local stack (Docker)
npm run db:reset     # re-apply migrations + seed
npm run db:test      # pgTAP
npm run db:types     # regenerate src/types/database.ts
npm run db:verify    # end-to-end HTTP checks (local only)
```
