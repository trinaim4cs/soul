# SOUL: Database

Postgres 17 + PostGIS on Supabase. All changes go through migrations in `supabase/migrations` (never by hand). The security rules are in `SECURITY_MODEL.md`.

## Schemas

| Schema | Exposed via API | Contents |
|---|---|---|
| `public` | yes (RLS on every table, forced) | account and profile data, config, audit |
| `private` | **no** | security helpers and trigger functions; restricted tables (`free_swipe_claims`, Instant Meet positions, acceptances and passes) |
| `auth`, `storage` | managed by Supabase | users, sessions, storage objects |

## Tables (Phases 3, 5, 6, 7, 8, 9, 10 and 11)

| Table | Client access | Notes |
|---|---|---|
| `account_private` | owner **read** only | account state; SRMIST email verified time (from OTP); accepted terms version; self-declared date of birth (18+ check constraint, set once via `set_date_of_birth`); under-18 lock time; profile-complete time. Written only by server functions and triggers |
| `profiles` | owner read; owner **update of editable columns only** (`display_name` 1 to 30, `hook` ≤ 30, `about` ≤ 1000, `gender`, `zodiac_visible`, `privacy_mode`) | other users will only ever see projections from discovery and match functions |
| `preferences` | owner read; owner update of `show_me`, `min_age`, `max_age`, `zodiac_filter` | private "who I want to see" and discovery filters; 18+ enforced by a check; created for every account |
| `likes` | liker reads own rows | written only by `swipe_right`; one per pair; unique idempotency key |
| `matches` | none | one row per ordered pair (unique); written only by `swipe_right`, `mark_match_seen` and `unmatch`; unmatching keeps the row, inactive |
| `conversations` | none | one per match (`match_id`) or per Instant Meet session (`instant_session_id`), never both; `closed_at` set on unmatch or when the session ends |
| `conversation_members` | none | each person's read position (`last_read_message_id`) |
| `messages` | none | written only by `send_message`; 1 to 2000 characters; unique `(sender_id, client_id)`; optional `reply_to_id` in the same conversation |
| `plans` | signed-in users read active rows | the catalog (D-047): price in paise, right swipes, period, Instant inclusion; a top-up can never include Instant |
| `subscriptions` | none | one row per bought plan period; unique `source_key` (the payment) |
| `swipe_credit_ledger` | none | append-only (trigger); `grant` rows are lots with a validity window, other rows draw from a lot; unique idempotency key |
| `private.free_swipe_claims` | none (private schema) | fingerprint of each address that has had its free swipes |
| `private.instant_presence` | none (private schema) | Instant on: `active_until`, the latest position (`location` geography), its ~110 m grid cell (`area`), accuracy and time. One row per person, no history; deleted when Instant ends (D-050) |
| `private.instant_accepts` / `private.instant_skips` | none (private schema) | "Meet now" and "Not now" for the current activation; cleared when it ends |
| `date_rounds` | none | one "Did you meet?" round per pair at a time (`status` open/confirmed/declined/expired/void), each person's answer and time, the source (an active match or an Instant Meet of the last 7 days), confirmation and moderator invalidation (D-051) |
| `date_review_flags` | none | repeated pairs and unusual volume, for moderators |
| `private.hot_person_state` | none (private schema) | the last recorded badge state per person, kept by the hourly job for the audit trail |
| `instant_sessions` | none | who met whom and when, never where: start, expiry, end time, who ended it and why (`ended`, `expired`, `stopped`, `unavailable`) |
| `passes` | passer reads own rows | written only by `swipe_left`; `passed_at` drives the 30-day cooldown |
| `profile_photos` | owner **read** only | rows are written only by `add_profile_photo` and `remove_profile_photo` (service role, via the `profile-photos` Edge Function) and `reorder_profile_photos`; `status` pending/approved/rejected; positions 0 to 5 (unique, deferred); paths must be the owner's own `{uid}/{id}.jpg` |
| `blocks` | blocker reads own rows | stored one-way, effective both ways (`private.is_blocked`); created only by server functions |
| `admin_roles` | none | checked by `private.has_admin_role` |
| `feature_flags` | read | server-managed |
| `app_config` | read `client_visible` keys only | required rows live in a migration: `allowed_email_domains` (hidden; also readable by the Auth hook), `current_terms_version`, `free_right_swipes` (4, one-time), `instant_radius_m` (1000), `instant_session_minutes` (30), and the date and badge rules `date_confirm_window_days` (7), `date_cooldown_hours` (24, hidden), `date_instant_days` (7, hidden), `hot_person_threshold` (3), `hot_person_window_days` (30), `hot_person_distinct_partners` (true, hidden; C-14), and hidden Instant limits: `instant_fix_max_age_seconds` (90), `instant_fix_max_accuracy_m` (200), `instant_grid_degrees` (0.001), `instant_fix_min_interval_seconds` (2), `instant_max_speed_mps` (20) |
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
- `public.get_my_matches()` / `public.get_match(id)`: the caller's active matches as whitelisted cards, with their own seen flag, the conversation id, its last message and the unread count, most recent activity first.
- `public.send_message(conversation, body, client_id, reply_to)`, `public.get_messages(conversation, before, limit)`, `public.mark_conversation_read(conversation, message)`: chat (D-049).
- Triggers: `on_match_created` creates the conversation and nudges both accounts; `on_message_created` broadcasts the stored message.
- `private.can_join_topic(topic)`: the Realtime authorization rule, used by the two policies on `realtime.messages` (receive on own topics; publish only on `typing:`).
- `public.mark_match_seen(id)` / `public.unmatch(id)`: participants only.
- `private.lock_pair`, `private.active_match`, `private.can_view_match`, `private.unseen_match`, and `private.profile_card(uid, for_match)` (the reveal rule for anonymous people, D-048).
- `public.get_my_swipes()`: the caller's balance, per-source split, current plan and Instant entitlement; makes the one-time free grant.
- Instant Meet (D-050): `public.instant_start(minutes)` (15, 30 or 60; plan gate), `public.instant_stop()`, `public.instant_update_location(latitude, longitude, accuracy)` (returns only success; one every 2 s; impossible jumps refused), `public.instant_candidates()` (cards with no distance or direction), `public.instant_accept(candidate)`, `public.instant_skip(candidate)`, `public.instant_state()` (flags, and during a session the rounded distance, 15° bearing or `nearby`), `public.instant_end_session()`. No function returns a coordinate.
- Dates (D-051): `public.date_state(other)` (what the caller may see: ask, waiting or confirmed, never the other person's pending answer), `public.answer_date(other, met)`, `public.get_my_dates()` (the owner's private count), `public.invalidate_date(round, reason)` (moderators). Helpers `private.counted_dates`, `private.is_hot_person` (used live by the card function and `get_my_profile`), `private.refresh_hot_person`, `private.date_source`, `private.date_allowed`, `private.expire_date_rounds`, `private.flag_date`; trigger `on_block_void_dates`; `pg_cron` job `soul-dates-consistency` (hourly) runs `private.dates_consistency()`.
- Instant helpers: `private.has_instant`, `private.instant_compatible`, `private.instant_fix` and `private.instant_area` (a usable position and its cell), `private.instant_candidate_ids`, `private.instant_visible` (photo signing for candidates and session partners), `private.active_instant_session`, `private.end_instant_session` and `private.instant_sweep` (lazy expiry).
- `public.activate_plan(user, plan, key)`: **service role only**. Grants a plan period or a top-up exactly once per payment key.
- `private.swipe_lots`, `private.swipe_balance`, `private.ensure_free_swipes`, `private.lock_swipes`: balance and locking helpers.
- `private.is_eligible(uid)`, `private.can_view_profile(viewer, candidate)`, `private.profile_card(uid)`, `private.can_view_photo_object(bucket, name)` (the last is the only private function callable by `authenticated`, because Storage policies run as the caller).
- `public.get_my_profile()`: the owner's own profile with derived age and zodiac, never the date of birth.
- `private.is_blocked(a, b)` and `private.has_admin_role(uid, minimum)` are SECURITY DEFINER with a pinned `search_path` and are not executable by API roles.

## Storage

Five private buckets: `photo-uploads` (the app's inbox: owner inserts `{uid}/{id}.jpg` and `.tiny.jpg` only, at most 4 waiting, JPEG, 3 MB), `profile-photos` and `profile-photos-blurred` (written only by the `profile-photos` Edge Function; the owner reads `{uid}/…`), `report-evidence` and `chat-media` (no client policies). Other students can sign (and so read) a photo only when `private.can_view_photo_object` allows it: approved, and visible to them under D-042, as an active match (D-048), or as an Instant Meet candidate or session partner (D-050). An anonymous person's originals are signed only for a match, and only if they allow the reveal; otherwise only the blurred copy.

## Tests

- `supabase/tests/database/*.test.sql` (pgTAP): **420 assertions pass across 12 files** (Phase 11 adds 63 in `012`: no direct access to answers, flags or badge state, only a real match or a recent Instant Meet, a pending yes invisible to the other person, confirmation, the cooldown, a no and the note to the first yes, expiry and a fresh round, blocks and unmatches, the badge at the 30-day boundary, live on cards and in the owner's preview and never as a number, distinct partners and its config, the audit trail and review flags, moderator invalidation, the scheduled job) (Phase 10 adds 71 in `011`: the plan gate and durations, no position before Instant is on, no client access to positions, acceptances or sessions, the 1 km boundary at 0.9 and 1.4 km, inaccurate and stale positions ignored, compatibility, blocks, unmatched pairs and passes, nothing shared before both accept, rounded distances and bearings in both directions, only `nearby` under 100 m, no coordinate anywhere in the output, the session chat for the two people only, End Meet, Turn off, expiry and a block each ending everything for both, the rate limit, the jump check, and the grid hiding the exact boundary) (Phase 9 adds 47 in `010`: sending, trimming and limits, retries stored once, replies, no direct table access, outsiders and other matches refused, topic authorization, unread and read positions, mutual receipts, the rate limit, paging, a broadcast per stored message, closing on unmatch) (Phase 8 adds 46 in `009`: one-sided likes, the matching like, replays, one row per pair, seen state per person, outsiders refused, matches surviving filter changes, the anonymous reveal on and off including Storage signing, blocked and suspended matches hidden, unmatch and no rematch) (Phase 7 adds 45 in `008`: catalog values, no client grants, free swipes once per address, charging, replays, passes free, `no_swipes`, plan expiry, overlapping plans, Instant by plan, append-only ledger, config-driven free quantity) (auth hardening adds 14 in `007`: the domain check, the token hook refusing passwords and keeping code sessions, email changes kept inside the allowed domains) (photo intake adds 15 in `006` plus 4 in `004`: no direct publishing, inbox names and folders, the inbox cap, published photos cannot be deleted or swapped, the photo functions are service-only) (Phase 6 adds 38: every visibility rule with 16 fixture accounts, anonymous cards, likes and passes, idempotency, cooldown, zodiac inference, Storage reads) (Phase 5 adds 27: photo registration and limits, no self-approval, review flag, reorder and removal rules, completion, derived age and zodiac, cross-account isolation), including the SRMIST domain gate, terms versions, 18+ with lockout, and terms recorded at sign-up. The foundation file covers RLS forced everywhere, provisioning, anon denial, own-row-only reads, blocked self-verification, blocked account-state changes, column-limited profile edits, cross-account update isolation, unreadable server tables, hidden config, incomplete default status, and no public buckets.
- `npm run db:verify` runs an end-to-end HTTP check against the local stack: **87/87 pass** (Phase 11: a date after an Instant Meet, a first yes invisible to the other person, the second yes confirming and nudging the first phone, no double count, the private count, answers unreadable, outsiders and non-moderators refused) (Phase 10 over HTTP and Realtime: Instant needs a plan with it, no position is taken before Instant is on, 200 m is a candidate and 1.4 km is not, no coordinate or distance in the candidate list, positions and sessions unreadable, one yes shares nothing, the second starts the session and nudges both phones, rounded distance and 15° bearing, a 5 km jump refused, only `nearby` under 100 m, the session chat for the two people only, End Meet closing everything for both at once, and the chat topic refused afterwards) (Phase 9 over real Realtime sockets: members join, outsiders and other accounts' topics are refused, a message arrives live, a forged client broadcast is not delivered, typing and read receipts arrive, unmatch closes the chat) (Phase 8: simultaneous mutual likes make exactly one match per pair, announced to one request, charged once each; unmatch hides both ways) (Phase 7 races over real HTTP: 7 parallel likes with 3 swipes left charge exactly 3; 10 parallel requests for 2 people cost exactly 2; the app cannot activate a plan) (auth hardening: a password sign-up gets no session and is not verified, password sign-in is refused, an account cannot move to gmail) (photo intake: direct publishing refused, EXIF/GPS/XMP/ICC/comment/trailing bytes stripped, size read from the file, non-JPEG, wrong shape and oversized tiny copies refused, the inbox emptied, published photos cannot be deleted by the app, removal deletes both files, CORS preflight) (Phase 6 adds photo upload and registration, cross-folder upload refused, the feed, Storage signing for a visible profile, refusal for signed-out, private and anonymous originals, and a like). With the real Auth service, gmail and look-alike domains are refused, the OTP email is delivered, wrong codes are rejected, the correct code signs in and marks email verified, and replay is rejected. It covers the RPC via PostgREST, self-verification denied (42501), cross-account read denied, own hook edit, anon denied, and the Edge Function authenticated (200) and unauthenticated (401).

## Workflow

```bash
npm run db:start     # local stack (Docker)
npm run db:reset     # re-apply migrations + seed
npm run db:test      # pgTAP
npm run db:types     # regenerate src/types/database.ts
npm run db:verify    # end-to-end HTTP checks (local only)
```
