-- SOUL Phase 3: accounts, profiles, blocks, admin roles, config, audit.

------------------------------------------------------------------------------
-- account_private: the owner's own non-public account data and server-decided state.
-- Owner may read; nobody writes through the API (server functions only).
------------------------------------------------------------------------------
create table public.account_private (
  id uuid primary key references auth.users (id) on delete cascade,
  account_state public.account_state not null default 'active',
  -- Verification is SRMIST email + OTP only (DECISIONS D-027).
  institutional_email_verified_at timestamptz,
  -- Rules, terms and privacy accepted before sign-in; recorded after OTP (D-029).
  terms_version text,
  terms_accepted_at timestamptz,
  -- Self-declared date of birth, 18+ enforced server-side, never public (D-028).
  date_of_birth date,
  -- Set when someone enters an under-18 date of birth; blocks re-entry for a period.
  age_gate_failed_at timestamptz,
  -- Set by the server when the minimum profile is complete (Phase 5).
  profile_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint date_of_birth_is_adult check (
    date_of_birth is null or date_of_birth <= (current_date - interval '18 years')
  ),
  constraint terms_recorded_together check ((terms_version is null) = (terms_accepted_at is null))
);

create trigger account_private_touch before update on public.account_private
  for each row execute function private.touch_updated_at();

alter table public.account_private enable row level security;
alter table public.account_private force row level security;

create policy account_private_owner_read on public.account_private
  for select to authenticated
  using ((select auth.uid()) = id);

revoke all on public.account_private from anon, authenticated;
grant select on public.account_private to authenticated;

------------------------------------------------------------------------------
-- profiles: the user's editable profile. Owner-only access in Phase 3; other users
-- will only ever see projections returned by discovery/match functions (Phase 7+).
------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  hook text,
  about text,
  zodiac_visible boolean not null default false,
  privacy_mode public.privacy_mode not null default 'normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint display_name_length check (display_name is null or char_length(btrim(display_name)) between 1 and 30),
  constraint hook_length check (hook is null or char_length(hook) <= 30),
  constraint about_length check (about is null or char_length(about) <= 1000)
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy profiles_owner_read on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_owner_update on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Column-level: only user-editable fields. Status-like fields stay server-only.
grant update (display_name, hook, about, zodiac_visible, privacy_mode) on public.profiles to authenticated;

------------------------------------------------------------------------------
-- blocks: stored one-way, effective both ways (SECURITY_MODEL 5). The blocked person
-- can never read a row about themselves.
------------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
alter table public.blocks force row level security;

create policy blocks_blocker_read on public.blocks
  for select to authenticated
  using ((select auth.uid()) = blocker_id);

revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;
-- Creating/removing blocks goes through server functions (Phase 14), which also revoke
-- realtime access, Instant sessions and discovery in the same transaction.

------------------------------------------------------------------------------
-- admin_roles: server-held roles. No API access at all.
------------------------------------------------------------------------------
create table public.admin_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.admin_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null
);

alter table public.admin_roles enable row level security;
alter table public.admin_roles force row level security;
revoke all on public.admin_roles from anon, authenticated;

------------------------------------------------------------------------------
-- feature_flags and app_config: server-managed configuration.
------------------------------------------------------------------------------
create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text not null,
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;
alter table public.feature_flags force row level security;

create policy feature_flags_read on public.feature_flags
  for select to authenticated
  using (true);

revoke all on public.feature_flags from anon, authenticated;
grant select on public.feature_flags to authenticated;

create table public.app_config (
  key text primary key,
  value jsonb not null,
  -- Only explicitly public keys are readable by clients.
  client_visible boolean not null default false,
  description text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;
alter table public.app_config force row level security;

create policy app_config_client_visible_read on public.app_config
  for select to authenticated
  using (client_visible);

revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to authenticated;

------------------------------------------------------------------------------
-- audit_events: append-only, written by server functions, never readable by clients.
------------------------------------------------------------------------------
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_actor_idx on public.audit_events (actor_id, created_at desc);

alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
revoke all on public.audit_events from anon, authenticated;
