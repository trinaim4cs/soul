-- SOUL Phase 15: admin and operations (spec 45, 69; DECISIONS D-019, D-055).
--
--   * every power is a server function that checks `admin_roles`; the app's admin screens
--     only call these functions and show what they return. Roles are granted by the owner
--     in the database, never from the app
--   * moderators: reports, photos, appeals, date reviews, account lookup (exact email or id,
--     no name search), suspend / ban / restore
--   * admins as well: plans, likes and plan grants for support cases, and feature flags
--   * every action is logged in `moderation_actions` and `audit_events`

------------------------------------------------------------------------------
-- More logged actions.
------------------------------------------------------------------------------
alter table public.moderation_actions drop constraint moderation_action_valid;
alter table public.moderation_actions add constraint moderation_action_valid check (action in (
  'suspend', 'ban', 'restore', 'approve_photo', 'reject_photo', 'resolve_report', 'dismiss_report',
  'appeal_restored', 'appeal_upheld', 'invalidate_date', 'clear_date_flag', 'view_account',
  'grant_likes', 'grant_plan', 'update_plan', 'set_flag'));

------------------------------------------------------------------------------
-- Instant Meet kill switch (a feature flag): when off, nobody new can turn Instant on and
-- everyone waiting for candidates is taken out. Sessions already running continue to their end.
------------------------------------------------------------------------------
insert into public.app_config (key, value, client_visible, description) values
  ('instant_open', 'true', true, 'Instant Meet accepts people; off pauses it for everyone.')
on conflict (key) do nothing;

create or replace function public.instant_start(p_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform private.instant_sweep();
  if coalesce((private.config_value('instant_open'))::boolean, true) is false then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if not private.is_eligible(uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;
  if not private.has_instant(uid) then
    return jsonb_build_object('ok', false, 'reason', 'no_plan');
  end if;
  if p_minutes is null or p_minutes not in (15, 30, 60) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_duration');
  end if;
  if (private.active_instant_session(uid)).id is not null then
    return jsonb_build_object('ok', false, 'reason', 'in_session');
  end if;
  insert into private.instant_presence (user_id, active_until)
  values (uid, now() + make_interval(mins => p_minutes))
  on conflict (user_id) do update
    set active_until = excluded.active_until, started_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

------------------------------------------------------------------------------
-- Moderators can see any profile photo (pending ones included) to review photos and reports.
------------------------------------------------------------------------------
create function private.moderator_can_view_photo(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_admin_role((select auth.uid()), 'moderator')
    and exists (
      select 1 from public.profile_photos ph
      where (p_bucket = 'profile-photos' and ph.storage_path = p_name)
         or (p_bucket = 'profile-photos-blurred' and ph.blurred_path = p_name));
$$;
revoke all on function private.moderator_can_view_photo(text, text) from public, anon;
grant execute on function private.moderator_can_view_photo(text, text) to authenticated;

create policy profile_photos_moderator_select on storage.objects for select to authenticated
  using (bucket_id in ('profile-photos', 'profile-photos-blurred')
         and private.moderator_can_view_photo(bucket_id, name));

------------------------------------------------------------------------------
-- Appeals (spec 45): a suspended or banned person asks for a review, once at a time.
------------------------------------------------------------------------------
create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  account_state public.account_state not null,
  restriction_reason text,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  note text,
  constraint appeal_status_valid check (status in ('open', 'restored', 'upheld')),
  constraint appeal_message_length check (length(message) between 1 and 1000)
);
create unique index appeals_one_open on public.appeals (user_id) where status = 'open';
alter table public.appeals enable row level security;
alter table public.appeals force row level security;
revoke all on public.appeals from anon, authenticated;

create function public.submit_appeal(p_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  account public.account_private%rowtype;
  body text := btrim(coalesce(p_message, ''));
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into account from public.account_private where id = uid;
  if account.account_state not in ('suspended', 'banned') then
    return jsonb_build_object('ok', false, 'reason', 'not_restricted');
  end if;
  if length(body) = 0 or length(body) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if exists (select 1 from public.appeals where user_id = uid and status = 'open') then
    return jsonb_build_object('ok', false, 'reason', 'already_open');
  end if;
  if (select count(*) from public.appeals where user_id = uid and created_at > now() - interval '30 days') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  insert into public.appeals (user_id, account_state, restriction_reason, message)
  values (uid, account.account_state, account.restriction_reason, body);
  return jsonb_build_object('ok', true);
end;
$$;

/** What the restricted screen shows: whether a review is pending, and the last answer. */
create function public.get_my_appeal()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'appeal', (
    select jsonb_build_object('status', a.status, 'created_at', a.created_at, 'decided_at', a.decided_at)
    from public.appeals a where a.user_id = (select auth.uid())
    order by a.created_at desc limit 1));
$$;

create function public.moderation_decide_appeal(p_appeal uuid, p_restore boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  moderator uuid := private.require_moderator();
  appeal public.appeals%rowtype;
  restored jsonb;
begin
  select * into appeal from public.appeals where id = p_appeal and status = 'open' for update;
  if appeal.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p_restore then
    restored := public.moderation_set_state(appeal.user_id, 'active', null, null);
    if not coalesce((restored ->> 'ok')::boolean, false) then
      return restored;
    end if;
  end if;
  update public.appeals
    set status = case when p_restore then 'restored' else 'upheld' end,
        decided_at = now(), decided_by = moderator, note = left(btrim(p_note), 500)
    where id = appeal.id;
  insert into public.moderation_actions (moderator_id, target_user, target_fingerprint, action, reason)
  values (moderator, appeal.user_id, private.user_fingerprint(appeal.user_id),
          case when p_restore then 'appeal_restored' else 'appeal_upheld' end, left(btrim(p_note), 500));
  perform realtime.send(jsonb_build_object('reason', 'account'), 'refresh', 'user:' || appeal.user_id::text, true);
  return jsonb_build_object('ok', true);
end;
$$;

------------------------------------------------------------------------------
-- Who is signed in, for the app's admin entry point. Grants nothing by itself.
------------------------------------------------------------------------------
create function public.get_my_admin_role()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'role', (
    select r.role from public.admin_roles r where r.user_id = (select auth.uid())));
$$;

------------------------------------------------------------------------------
-- The queue: reports, photos, appeals and flagged dates.
------------------------------------------------------------------------------
create or replace function public.moderation_queue()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  moderator uuid := private.require_moderator();
begin
  return jsonb_build_object(
    'ok', true,
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'category', r.category, 'context', r.context, 'details', r.details,
        'priority', r.priority, 'created_at', r.created_at, 'reported_id', r.reported_id,
        'reported_deleted', r.reported_id is null, 'evidence', r.evidence,
        'reports_against', (select count(*) from public.reports x
                            where x.reported_fingerprint = r.reported_fingerprint))
        order by r.priority desc, r.created_at)
      from (select * from public.reports where status = 'open'
            order by priority desc, created_at limit 50) r), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'user_id', ph.user_id, 'path', ph.storage_path,
                                          'position', ph.position, 'created_at', ph.created_at)
                       order by ph.created_at)
      from (select * from public.profile_photos where status = 'pending' order by created_at limit 50) ph), '[]'::jsonb),
    'appeals', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'user_id', a.user_id, 'account_state', a.account_state,
                                          'restriction_reason', a.restriction_reason, 'message', a.message,
                                          'created_at', a.created_at)
                       order by a.created_at)
      from (select * from public.appeals where status = 'open' order by created_at limit 50) a), '[]'::jsonb),
    'date_flags', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'date_round_id', f.date_round_id, 'user_id', f.user_id,
                                          'reason', f.reason, 'created_at', f.created_at,
                                          'user_a', d.user_a, 'user_b', d.user_b, 'status', d.status,
                                          'invalidated', d.invalidated_at is not null)
                       order by f.created_at)
      from (select * from public.date_review_flags where reviewed_at is null order by created_at limit 50) f
      join public.date_rounds d on d.id = f.date_round_id), '[]'::jsonb)
  );
end;
$$;

/** A flagged date: invalidate it (the badge is recomputed) or clear the flag. */
create function public.moderation_review_date_flag(p_flag bigint, p_invalidate boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  moderator uuid := private.require_moderator();
  flag public.date_review_flags%rowtype;
  result jsonb;
begin
  select * into flag from public.date_review_flags where id = p_flag and reviewed_at is null for update;
  if flag.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p_invalidate then
    result := public.invalidate_date(flag.date_round_id, coalesce(nullif(btrim(p_note), ''), 'review'));
    if not coalesce((result ->> 'ok')::boolean, false) and result ->> 'reason' <> 'not_found' then
      return result;
    end if;
  end if;
  update public.date_review_flags set reviewed_at = now(), reviewed_by = moderator
    where date_round_id = flag.date_round_id and reviewed_at is null;
  insert into public.moderation_actions (moderator_id, target_user, action, reason)
  values (moderator, flag.user_id, case when p_invalidate then 'invalidate_date' else 'clear_date_flag' end,
          left(btrim(p_note), 500));
  return jsonb_build_object('ok', true);
end;
$$;

------------------------------------------------------------------------------
-- Accounts: exact lookup only (no name search), and one account's operational facts.
------------------------------------------------------------------------------
create function public.admin_find_account(p_query text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  moderator uuid := private.require_moderator();
  q text := lower(btrim(coalesce(p_query, '')));
  found uuid;
begin
  if q ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into found from auth.users where id = q::uuid;
  elsif q like '%@%' then
    select id into found from auth.users where lower(email) = q;
  else
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if found is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'id', found);
end;
$$;

create function public.admin_account_detail(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  moderator uuid := private.require_moderator();
  account public.account_private%rowtype;
  result jsonb;
begin
  select * into account from public.account_private where id = p_user;
  if account.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select jsonb_build_object(
    'ok', true,
    'id', account.id,
    'email', (select email from auth.users where id = account.id),
    'role', (select role from public.admin_roles where user_id = account.id),
    'created_at', account.created_at,
    'account_state', account.account_state,
    'restricted_until', account.restricted_until,
    'restriction_reason', account.restriction_reason,
    -- Verification (D-027): the SRMIST code, the rules version, the self-declared age.
    'email_verified_at', account.institutional_email_verified_at,
    'terms_version', account.terms_version,
    'age', private.age_of(account.date_of_birth),
    'age_check_failed_at', account.age_gate_failed_at,
    'profile_completed_at', account.profile_completed_at,
    'profile', (select jsonb_build_object('name', p.display_name, 'hook', p.hook, 'gender', p.gender,
                                          'privacy_mode', p.privacy_mode)
                from public.profiles p where p.id = account.id),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path,
                                                             'status', ph.status, 'position', ph.position)
                                         order by ph.position)
                        from public.profile_photos ph where ph.user_id = account.id), '[]'::jsonb),
    'reports_against', (select count(*) from public.reports r
                        where r.reported_fingerprint = private.user_fingerprint(account.id)),
    'open_reports_against', (select count(*) from public.reports r
                             where r.reported_fingerprint = private.user_fingerprint(account.id) and r.status = 'open'),
    'reports_made', (select count(*) from public.reports r where r.reporter_id = account.id),
    'history', coalesce((select jsonb_agg(jsonb_build_object('action', m.action, 'reason', m.reason,
                                                             'created_at', m.created_at) order by m.created_at desc)
                         from (select * from public.moderation_actions
                               where target_user = account.id and action <> 'view_account'
                               order by created_at desc limit 20) m), '[]'::jsonb),
    'appeals', coalesce((select jsonb_agg(jsonb_build_object('status', a.status, 'message', a.message,
                                                             'created_at', a.created_at) order by a.created_at desc)
                         from public.appeals a where a.user_id = account.id), '[]'::jsonb),
    'likes_left', private.swipe_balance(account.id),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('plan_id', s.plan_id, 'ends_at', s.ends_at,
                                                           'status', s.status) order by s.ends_at desc)
                       from public.subscriptions s
                       where s.user_id = account.id and s.status = 'active' and s.ends_at > now()), '[]'::jsonb),
    'payments', (select count(*) from public.payment_orders o where o.user_id = account.id and o.status = 'paid'),
    'hot_person', private.is_hot_person(account.id),
    'counted_dates', private.counted_dates(account.id),
    'open_date_flags', (select count(*) from public.date_review_flags f
                        join public.date_rounds d on d.id = f.date_round_id
                        where f.reviewed_at is null and account.id in (d.user_a, d.user_b)),
    'devices', (select count(*) from public.push_devices pd where pd.user_id = account.id and pd.disabled_at is null)
  ) into result;
  -- Looking at an account is itself logged.
  insert into public.moderation_actions (moderator_id, target_user, action)
  values (moderator, account.id, 'view_account');
  return result;
end;
$$;

------------------------------------------------------------------------------
-- Admins only: plans, support grants and feature flags.
------------------------------------------------------------------------------
create function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or not private.has_admin_role(uid, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return uid;
end;
$$;
revoke all on function private.require_admin() from public, anon, authenticated;

create function public.admin_list_plans()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := private.require_admin();
begin
  return jsonb_build_object('ok', true, 'plans', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'title', p.title,
                                        'price_paise', p.price_paise, 'right_swipes', p.right_swipes,
                                        'period_label', p.period_label, 'includes_instant', p.includes_instant,
                                        'active', p.active) order by p.sort_order)
    from public.plans p), '[]'::jsonb));
end;
$$;

-- Price, likes and whether it is on sale. Orders already open keep their frozen price (D-052).
create function public.admin_update_plan(p_plan text, p_price_paise integer, p_right_swipes integer, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := private.require_admin();
  before public.plans%rowtype;
begin
  select * into before from public.plans where id = p_plan for update;
  if before.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p_price_paise is null or p_price_paise not between 100 and 1000000
     or p_right_swipes is null or p_right_swipes not between 1 and 1000 or p_active is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  update public.plans set price_paise = p_price_paise, right_swipes = p_right_swipes, active = p_active
    where id = p_plan;
  insert into public.moderation_actions (moderator_id, action, reason)
  values (admin, 'update_plan', p_plan);
  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (admin, 'plan_updated', 'plan', p_plan, jsonb_build_object(
    'before', jsonb_build_object('price_paise', before.price_paise, 'right_swipes', before.right_swipes, 'active', before.active),
    'after', jsonb_build_object('price_paise', p_price_paise, 'right_swipes', p_right_swipes, 'active', p_active)));
  return jsonb_build_object('ok', true);
end;
$$;

-- Support: likes that never expire (like a top-up), with a reason. Never through the app's own flows.
create function public.admin_grant_likes(p_user uuid, p_quantity integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := private.require_admin();
  key text := 'admin:' || gen_random_uuid();
begin
  if p_quantity is null or p_quantity not between 1 and 100 or coalesce(btrim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  perform private.lock_swipes(p_user);
  insert into public.swipe_credit_ledger (user_id, entry, bucket, delta, valid_from, idempotency_key)
  values (p_user, 'grant', 'topup', p_quantity, now(), key);
  insert into public.moderation_actions (moderator_id, target_user, action, reason)
  values (admin, p_user, 'grant_likes', left(btrim(p_reason), 500));
  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (admin, 'likes_granted', 'user', p_user::text,
          jsonb_build_object('quantity', p_quantity, 'reason', left(btrim(p_reason), 500)));
  perform realtime.send(jsonb_build_object('reason', 'payment'), 'refresh', 'user:' || p_user::text, true);
  return jsonb_build_object('ok', true, 'likes_left', private.swipe_balance(p_user));
end;
$$;

-- Support: a plan, for example when a payment went through but never reached SOUL.
create function public.admin_grant_plan(p_user uuid, p_plan text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := private.require_admin();
  result jsonb;
begin
  if coalesce(btrim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  result := public.activate_plan(p_user, p_plan, 'admin:' || gen_random_uuid());
  if not coalesce((result ->> 'ok')::boolean, false) then
    return result;
  end if;
  insert into public.moderation_actions (moderator_id, target_user, action, reason)
  values (admin, p_user, 'grant_plan', left(p_plan || ': ' || btrim(p_reason), 500));
  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (admin, 'plan_granted', 'user', p_user::text,
          jsonb_build_object('plan', p_plan, 'reason', left(btrim(p_reason), 500)));
  perform realtime.send(jsonb_build_object('reason', 'payment'), 'refresh', 'user:' || p_user::text, true);
  return jsonb_build_object('ok', true);
end;
$$;

-- Feature flags: only these keys, each with its type and range. Product rules that the owner
-- fixed (free likes, the 1 km radius, prices through plans) are not flags.
create function private.flag_spec()
returns table (key text, kind text, min_value integer, max_value integer, label text)
language sql
immutable
set search_path = ''
as $$
  values
    ('payments_open', 'boolean', null::integer, null::integer, 'Payments open'),
    ('instant_open', 'boolean', null, null, 'Instant Meet open'),
    ('photo_review_required', 'boolean', null, null, 'Review every new photo before it shows'),
    ('hot_person_distinct_partners', 'boolean', null, null, 'Badge counts one date per person'),
    ('hot_person_threshold', 'integer', 1, 10, 'Dates for the badge (30 days)'),
    ('report_daily_limit', 'integer', 1, 50, 'Reports per person per day')
$$;
revoke all on function private.flag_spec() from public, anon, authenticated;

create function public.admin_list_flags()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := private.require_admin();
begin
  return jsonb_build_object('ok', true, 'flags', coalesce((
    select jsonb_agg(jsonb_build_object('key', s.key, 'kind', s.kind, 'min', s.min_value, 'max', s.max_value,
                                        'label', s.label, 'value', c.value) order by s.label)
    from private.flag_spec() s left join public.app_config c on c.key = s.key), '[]'::jsonb));
end;
$$;

create function public.admin_set_flag(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := private.require_admin();
  spec record;
  before jsonb;
begin
  select * into spec from private.flag_spec() s where s.key = p_key;
  if spec.key is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_flag');
  end if;
  if spec.kind = 'boolean' and jsonb_typeof(p_value) <> 'boolean' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if spec.kind = 'integer' and (jsonb_typeof(p_value) <> 'number'
     or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric)
     or (p_value #>> '{}')::numeric not between spec.min_value and spec.max_value) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select value into before from public.app_config where key = p_key;
  update public.app_config set value = p_value where key = p_key;
  -- Pausing Instant Meet takes everyone waiting out of it at once.
  if p_key = 'instant_open' and p_value = 'false'::jsonb then
    delete from private.instant_presence where true;
  end if;
  insert into public.moderation_actions (moderator_id, action, reason)
  values (admin, 'set_flag', p_key || '=' || p_value::text);
  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (admin, 'flag_set', 'app_config', p_key, jsonb_build_object('before', before, 'after', p_value));
  return jsonb_build_object('ok', true);
end;
$$;

------------------------------------------------------------------------------
-- Grants.
------------------------------------------------------------------------------
revoke all on function public.submit_appeal(text) from public, anon;
revoke all on function public.get_my_appeal() from public, anon;
revoke all on function public.get_my_admin_role() from public, anon;
revoke all on function public.moderation_decide_appeal(uuid, boolean, text) from public, anon;
revoke all on function public.moderation_review_date_flag(bigint, boolean, text) from public, anon;
revoke all on function public.admin_find_account(text) from public, anon;
revoke all on function public.admin_account_detail(uuid) from public, anon;
revoke all on function public.admin_list_plans() from public, anon;
revoke all on function public.admin_update_plan(text, integer, integer, boolean) from public, anon;
revoke all on function public.admin_grant_likes(uuid, integer, text) from public, anon;
revoke all on function public.admin_grant_plan(uuid, text, text) from public, anon;
revoke all on function public.admin_list_flags() from public, anon;
revoke all on function public.admin_set_flag(text, jsonb) from public, anon;
grant execute on function public.submit_appeal(text) to authenticated;
grant execute on function public.get_my_appeal() to authenticated;
grant execute on function public.get_my_admin_role() to authenticated;
grant execute on function public.moderation_decide_appeal(uuid, boolean, text) to authenticated;
grant execute on function public.moderation_review_date_flag(bigint, boolean, text) to authenticated;
grant execute on function public.admin_find_account(text) to authenticated;
grant execute on function public.admin_account_detail(uuid) to authenticated;
grant execute on function public.admin_list_plans() to authenticated;
grant execute on function public.admin_update_plan(text, integer, integer, boolean) to authenticated;
grant execute on function public.admin_grant_likes(uuid, integer, text) to authenticated;
grant execute on function public.admin_grant_plan(uuid, text, text) to authenticated;
grant execute on function public.admin_list_flags() to authenticated;
grant execute on function public.admin_set_flag(text, jsonb) to authenticated;
