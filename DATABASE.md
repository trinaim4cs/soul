# SOUL: Database

Postgres 17 + PostGIS on Supabase. All changes go through migrations in `supabase/migrations` (never by hand). The security rules are in `SECURITY_MODEL.md`.

## Schemas

| Schema | Exposed via API | Contents |
|---|---|---|
| `public` | yes (RLS on every table, forced) | account and profile data, config, audit |
| `private` | **no** | security helpers and trigger functions; future restricted tables (Instant Meet private location state) |
| `auth`, `storage` | managed by Supabase | users, sessions, storage objects |

## Tables (Phases 3 and 5)

| Table | Client access | Notes |
|---|---|---|
| `account_private` | owner **read** only | account state; SRMIST email verified time (from OTP); accepted terms version; self-declared date of birth (18+ check constraint, set once via `set_date_of_birth`); under-18 lock time; profile-complete time. Written only by server functions and triggers |
| `profiles` | owner read; owner **update of editable columns only** (`display_name` 1 to 30, `hook` ≤ 30, `about` ≤ 1000, `gender`, `zodiac_visible`, `privacy_mode`) | other users will only ever see projections from discovery and match functions |
| `preferences` | owner read; owner update of `show_me`, `min_age`, `max_age`, `zodiac_filter` | private "who I want to see" and discovery filters; 18+ enforced by a check; created for every account |
| `profile_photos` | owner **read** only | rows are written only by `add_profile_photo`, `remove_profile_photo`, `reorder_profile_photos`; `status` pending/approved/rejected; positions 0 to 5 (unique, deferred); paths must be the owner's own `{uid}/{id}.jpg` |
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
- `public.accept_terms(version)`, only the current version accepted.
- `public.set_date_of_birth(date)`: once, 18+, under-18 refused and locked for 30 days without storing the date, zodiac derived via `private.zodiac_for`.
- `public.get_my_status()` (authenticated only) returns `eligibility`, `account_state`, steps `{email, terms, age, profile}`, `age_locked` and `current_terms_version`. The app routes on it.
- `on_auth_user_created` also records the rules version ticked before sign-in (from sign-up metadata), current version only.
- `public.add_profile_photo(id, width, height, source)`: registers an uploaded photo only when both storage objects exist in the caller's folders; applies the photo limit and the review flag.
- `public.remove_profile_photo(id)`: a completed profile keeps at least one photo; returns the object names for the client to delete.
- `public.reorder_profile_photos(ids)`: the full set in the new order; the first becomes the main photo.
- `public.submit_profile()`: checks the earlier steps and the required fields (photo, name, gender, show me, hook) and marks the profile step complete, or returns the missing fields.
- `public.get_my_profile()`: the owner's own profile with derived age and zodiac, never the date of birth.
- `private.is_blocked(a, b)` and `private.has_admin_role(uid, minimum)` are SECURITY DEFINER with a pinned `search_path` and are not executable by API roles.

## Storage

Four private buckets: `profile-photos` and `profile-photos-blurred` (owner-folder policies: the owner writes and reads only `{uid}/…`), `report-evidence` and `chat-media` (no client policies). Other users receive photos only as short-lived signed URLs from server functions (Phase 6).

## Tests

- `supabase/tests/database/*.test.sql` (pgTAP): **77 assertions pass across 4 files** (Phase 5 adds 27: photo registration and limits, no self-approval, review flag, reorder and removal rules, completion, derived age and zodiac, cross-account isolation), including the SRMIST domain gate, terms versions, 18+ with lockout, and terms recorded at sign-up. The foundation file covers RLS forced everywhere, provisioning, anon denial, own-row-only reads, blocked self-verification, blocked account-state changes, column-limited profile edits, cross-account update isolation, unreadable server tables, hidden config, incomplete default status, and no public buckets.
- `npm run db:verify` runs an end-to-end HTTP check against the local stack: **16/16 pass**. With the real Auth service, gmail and look-alike domains are refused, the OTP email is delivered, wrong codes are rejected, the correct code signs in and marks email verified, and replay is rejected. It covers the RPC via PostgREST, self-verification denied (42501), cross-account read denied, own hook edit, anon denied, and the Edge Function authenticated (200) and unauthenticated (401).

## Workflow

```bash
npm run db:start     # local stack (Docker)
npm run db:reset     # re-apply migrations + seed
npm run db:test      # pgTAP
npm run db:types     # regenerate src/types/database.ts
npm run db:verify    # end-to-end HTTP checks (local only)
```
