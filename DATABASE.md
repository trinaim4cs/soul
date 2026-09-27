# SOUL: Database

Postgres 17 + PostGIS on Supabase. All changes go through migrations in `supabase/migrations` (never by hand). The security rules are in `SECURITY_MODEL.md`.

## Schemas

| Schema | Exposed via API | Contents |
|---|---|---|
| `public` | yes (RLS on every table, forced) | account and profile data, config, audit |
| `private` | **no** | security helpers and trigger functions; future restricted tables (Instant Meet private location state) |
| `auth`, `storage` | managed by Supabase | users, sessions, storage objects |

## Tables (Phase 3)

| Table | Client access | Notes |
|---|---|---|
| `account_private` | owner **read** only | account state; SRMIST email verified time (from OTP); accepted terms version; self-declared date of birth (18+ check constraint, set once via `set_date_of_birth`); under-18 lock time; profile-complete time. Written only by server functions and triggers |
| `profiles` | owner read; owner **update of editable columns only** (`display_name`, `hook` ≤ 30, `about` ≤ 1000, `zodiac_visible`, `privacy_mode`) | other users will only ever see projections from discovery and match functions |
| `blocks` | blocker reads own rows | stored one-way, effective both ways (`private.is_blocked`); created only by server functions |
| `admin_roles` | none | checked by `private.has_admin_role` |
| `feature_flags` | read | server-managed |
| `app_config` | read `client_visible` keys only | required rows live in a migration: `allowed_email_domains` (hidden; also readable by the Auth hook), `current_terms_version`, `free_right_swipes` (4, one-time), `instant_radius_meters` (1000, hidden) |
| `audit_events` | none | append-only, written by server functions |

Enums: `account_state`, `privacy_mode`, `admin_role`. (No zones: spec v2 has no geofence.)

## Functions and triggers

- `on_auth_user_created` creates `account_private` and `profiles` rows for every new user.
- `on_auth_user_email_confirmed` mirrors the OTP-verified email into `account_private.institutional_email_verified_at`.
- `public.hook_before_user_created(event)` is the Auth hook (`supabase_auth_admin` only). It rejects any email whose domain is not in `allowed_email_domains`.
- `public.accept_terms(version)`, only the current version accepted.
- `public.set_date_of_birth(date)`: once, 18+, under-18 refused and locked for 30 days without storing the date, zodiac derived via `private.zodiac_for`.
- `public.get_my_status()` (authenticated only) returns `eligibility`, `account_state`, steps `{email, terms, age, profile}`, `age_locked` and `current_terms_version`. The app routes on it.
- `on_auth_user_created` also records the rules version ticked before sign-in (from sign-up metadata), current version only.
- `private.is_blocked(a, b)` and `private.has_admin_role(uid, minimum)` are SECURITY DEFINER with a pinned `search_path` and are not executable by API roles.

## Storage

Four private buckets: `profile-photos` (owner-folder policies), `profile-photos-blurred`, `report-evidence` and `chat-media`. The last three have no client policies; access goes through signed URLs issued by server functions.

## Tests

- `supabase/tests/database/*.test.sql` (pgTAP): **49 assertions pass across 3 files**, including the SRMIST domain gate, terms versions, 18+ with lockout, and terms recorded at sign-up. The foundation file covers RLS forced everywhere, provisioning, anon denial, own-row-only reads, blocked self-verification, blocked account-state changes, column-limited profile edits, cross-account update isolation, unreadable server tables, hidden config, incomplete default status, and no public buckets.
- `npm run db:verify` runs an end-to-end HTTP check against the local stack: **16/16 pass**. With the real Auth service, gmail and look-alike domains are refused, the OTP email is delivered, wrong codes are rejected, the correct code signs in and marks email verified, and replay is rejected. It covers the RPC via PostgREST, self-verification denied (42501), cross-account read denied, own hook edit, anon denied, and the Edge Function authenticated (200) and unauthenticated (401).

## Workflow

```bash
npm run db:start     # local stack (Docker)
npm run db:reset     # re-apply migrations + seed
npm run db:test      # pgTAP
npm run db:types     # regenerate src/types/database.ts
npm run db:verify    # end-to-end HTTP checks (local only)
```
