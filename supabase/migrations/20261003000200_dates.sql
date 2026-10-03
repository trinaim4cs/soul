-- SOUL Phase 11: "Did you meet?" and the fire badge (spec 35, 36, 41; DECISIONS D-017, D-051).
--
-- The rules this file enforces:
--   * only two people who really matched (or really met through Instant Meet) can confirm a date
--   * a date counts only when both answer yes, independently; nobody learns the other's answer
--     before giving their own (a first "yes" is invisible; a "no" with nothing pending stores
--     nothing)
--   * the same encounter is never counted twice: one counted date per pair per cooldown
--   * the badge is live: 3 counted dates in the rolling 30 days, by default with 3 different
--     people (C-14); only a true/false is ever public, the count only to its owner
--   * suspicious patterns are flagged for review and moderators can invalidate a date

create extension if not exists pg_cron;

insert into public.app_config (key, value, client_visible, description) values
  ('date_confirm_window_days', '7', true, 'How long the second person has to confirm a date.'),
  ('date_cooldown_hours', '24', false, 'One counted date per pair within this time (spec 35).'),
  ('date_instant_days', '7', false, 'How long after an Instant Meet the two can confirm they met.'),
  ('hot_person_threshold', '3', true, 'Confirmed dates needed for the fire badge (spec 36).'),
  ('hot_person_window_days', '30', true, 'Rolling window for the fire badge (spec 36).'),
  ('hot_person_distinct_partners', 'true', false,
   'Count only one date per partner toward the badge (D-017, C-14: default, owner to confirm).')
on conflict (key) do nothing;

------------------------------------------------------------------------------
-- Tables. No client access to any of them.
------------------------------------------------------------------------------
create table public.date_rounds (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  source text not null,
  match_id uuid references public.matches (id) on delete set null,
  instant_session_id uuid references public.instant_sessions (id) on delete set null,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  closes_at timestamptz not null,
  a_answer boolean,
  a_answered_at timestamptz,
  b_answer boolean,
  b_answered_at timestamptz,
  confirmed_at timestamptz,
  closed_at timestamptz,
  invalidated_at timestamptz,
  invalidated_by uuid references auth.users (id) on delete set null,
  invalidated_reason text,
  constraint date_pair_ordered check (user_a < user_b),
  constraint date_source_valid check (source in ('match', 'instant')),
  constraint date_status_valid check (status in ('open', 'confirmed', 'declined', 'expired', 'void')),
  constraint date_confirmed_shape check ((status = 'confirmed') = (confirmed_at is not null)),
  constraint date_closed_shape check ((status = 'open') = (closed_at is null)),
  constraint date_invalidation_shape check (invalidated_at is null or status = 'confirmed')
);
-- At most one pending round per pair.
create unique index date_rounds_one_open on public.date_rounds (user_a, user_b) where status = 'open';
create index date_rounds_counted_a on public.date_rounds (user_a, confirmed_at)
  where status = 'confirmed' and invalidated_at is null;
create index date_rounds_counted_b on public.date_rounds (user_b, confirmed_at)
  where status = 'confirmed' and invalidated_at is null;
alter table public.date_rounds enable row level security;
alter table public.date_rounds force row level security;
revoke all on public.date_rounds from anon, authenticated;

-- Patterns a moderator should look at (Phase 13/15 queue). Never shown to the people involved.
create table public.date_review_flags (
  id bigint generated always as identity primary key,
  date_round_id uuid not null references public.date_rounds (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  constraint date_flag_reason_valid check (reason in ('same_pair_repeated', 'high_volume'))
);
alter table public.date_review_flags enable row level security;
alter table public.date_review_flags force row level security;
revoke all on public.date_review_flags from anon, authenticated;

-- The last known badge state, kept by the consistency job for the audit trail (and push later).
-- The badge people see is always computed live, so it is never stale.
create table private.hot_person_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active boolean not null,
  changed_at timestamptz not null default now()
);

------------------------------------------------------------------------------
-- Counting and the badge.
------------------------------------------------------------------------------
/** Dates that count toward the badge right now: confirmed, not invalidated, inside the window. */
create function private.counted_dates(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with window_start as (
    select now() - make_interval(
      days => coalesce((private.config_value('hot_person_window_days'))::int, 30)) as at
  ), counted as (
    select r.id, r.user_b as partner from public.date_rounds r, window_start w
    where r.user_a = p_user and r.status = 'confirmed' and r.invalidated_at is null
      and r.confirmed_at > w.at
    union all
    select r.id, r.user_a as partner from public.date_rounds r, window_start w
    where r.user_b = p_user and r.status = 'confirmed' and r.invalidated_at is null
      and r.confirmed_at > w.at
  )
  select case
    when coalesce((private.config_value('hot_person_distinct_partners'))::boolean, true)
      then count(distinct partner)
    else count(*) end::int
  from counted;
$$;
revoke all on function private.counted_dates(uuid) from public, anon, authenticated;

create function private.is_hot_person(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.counted_dates(p_user) >= coalesce((private.config_value('hot_person_threshold'))::int, 3);
$$;
revoke all on function private.is_hot_person(uuid) from public, anon, authenticated;

/** Records a change of badge state (audit trail; the badge itself is computed live). */
create function private.refresh_hot_person(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_active boolean := private.is_hot_person(p_user);
  was_active boolean;
begin
  select active into was_active from private.hot_person_state where user_id = p_user;
  if was_active is not distinct from now_active then
    return;
  end if;
  if was_active is null and not now_active then
    return;
  end if;
  insert into private.hot_person_state (user_id, active, changed_at) values (p_user, now_active, now())
  on conflict (user_id) do update set active = excluded.active, changed_at = excluded.changed_at;
  insert into public.audit_events (actor_id, action, target_type, target_id)
  values (null, case when now_active then 'hot_person_on' else 'hot_person_off' end, 'user', p_user::text);
end;
$$;
revoke all on function private.refresh_hot_person(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Which encounter two people can confirm: an active match, or an Instant Meet session that
-- really started between them recently. Nothing else counts (spec 35: "must be a real match").
------------------------------------------------------------------------------
create function private.date_source(p_one uuid, p_other uuid)
returns table (source text, match_id uuid, instant_session_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  (
    select 'match', m.id, null::uuid
    from public.matches m
    where m.user_a = least(p_one, p_other) and m.user_b = greatest(p_one, p_other) and m.active
  )
  union all
  (
    select 'instant', null::uuid, s.id
    from public.instant_sessions s
    where s.user_a = least(p_one, p_other) and s.user_b = greatest(p_one, p_other)
      and s.started_at > now() - make_interval(
        days => coalesce((private.config_value('date_instant_days'))::int, 7))
    order by s.started_at desc
    limit 1
  )
  limit 1;
$$;
revoke all on function private.date_source(uuid, uuid) from public, anon, authenticated;

/** Closes rounds whose window has passed (for one pair, or for everyone when p_one is null). */
create function private.expire_date_rounds(p_one uuid default null, p_other uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.date_rounds
    set status = 'expired', closed_at = closes_at
    where status = 'open' and closes_at <= now()
      and (p_one is null or (user_a = least(p_one, p_other) and user_b = greatest(p_one, p_other)));
$$;
revoke all on function private.expire_date_rounds(uuid, uuid) from public, anon, authenticated;

/** Can these two confirm a date at all right now? */
create function private.date_allowed(p_one uuid, p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_one <> p_other
    and private.is_eligible(p_one)
    and private.is_eligible(p_other)
    and not private.is_blocked(p_one, p_other)
    and exists (select 1 from private.date_source(p_one, p_other));
$$;
revoke all on function private.date_allowed(uuid, uuid) from public, anon, authenticated;

/** Flags patterns that look like badge farming (never blocks the date itself). */
create function private.flag_date(p_round uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  round public.date_rounds%rowtype;
  person uuid;
begin
  select * into round from public.date_rounds where id = p_round;
  if (select count(*) from public.date_rounds
      where user_a = round.user_a and user_b = round.user_b and status = 'confirmed'
        and confirmed_at > now() - interval '30 days') >= 3 then
    insert into public.date_review_flags (date_round_id, reason) values (p_round, 'same_pair_repeated');
  end if;
  foreach person in array array[round.user_a, round.user_b] loop
    if (select count(*) from public.date_rounds
        where person in (user_a, user_b) and status = 'confirmed'
          and confirmed_at > now() - interval '7 days') >= 6 then
      insert into public.date_review_flags (date_round_id, user_id, reason)
      values (p_round, person, 'high_volume');
    end if;
  end loop;
end;
$$;
revoke all on function private.flag_date(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- date_state: what the caller sees for one person. Never the other person's answer while
-- the caller has not answered: a pending "yes" from them looks exactly like nothing at all.
------------------------------------------------------------------------------
create function public.date_state(p_other uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  me_a boolean;
  src record;
  pending public.date_rounds%rowtype;
  recent public.date_rounds%rowtype;
  last public.date_rounds%rowtype;
  cooldown interval := make_interval(hours => coalesce((private.config_value('date_cooldown_hours'))::int, 24));
  last_json jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_other is null or not private.date_allowed(uid, p_other) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  perform private.expire_date_rounds(uid, p_other);
  me_a := uid < p_other;
  select * into src from private.date_source(uid, p_other);

  select * into pending from public.date_rounds
    where user_a = least(uid, p_other) and user_b = greatest(uid, p_other) and status = 'open';
  select * into recent from public.date_rounds
    where user_a = least(uid, p_other) and user_b = greatest(uid, p_other)
      and status = 'confirmed' and confirmed_at > now() - cooldown
    order by confirmed_at desc limit 1;
  -- The caller's last closed "yes" of the past week, for a note on how it ended.
  select * into last from public.date_rounds
    where user_a = least(uid, p_other) and user_b = greatest(uid, p_other)
      and status in ('confirmed', 'declined', 'expired')
      and closed_at > now() - interval '7 days'
      and (case when me_a then a_answer else b_answer end) is true
    order by closed_at desc limit 1;
  if last.id is not null then
    last_json := jsonb_build_object(
      'outcome', case last.status when 'confirmed' then 'confirmed'
                                  when 'declined' then 'not_counted' else 'expired' end,
      'at', last.closed_at);
  end if;

  return jsonb_build_object(
    'ok', true,
    'person', private.profile_card(p_other, src.source = 'match'),
    'source', src.source,
    'state', case
      when recent.id is not null then 'confirmed'
      when pending.id is not null and (case when me_a then pending.a_answer else pending.b_answer end) is not null
        then 'waiting'
      else 'ask' end,
    'closes_at', case
      when recent.id is null and pending.id is not null
        and (case when me_a then pending.a_answer else pending.b_answer end) is not null
      then pending.closes_at end,
    'next_at', case when recent.id is not null then recent.confirmed_at + cooldown end,
    'last', last_json
  );
end;
$$;

------------------------------------------------------------------------------
-- answer_date: "Did you meet?" Yes or Not yet. Answers are final for a round.
------------------------------------------------------------------------------
create function public.answer_date(p_other uuid, p_met boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  me_a boolean;
  src record;
  pending public.date_rounds%rowtype;
  cooldown interval := make_interval(hours => coalesce((private.config_value('date_cooldown_hours'))::int, 24));
  window_days integer := coalesce((private.config_value('date_confirm_window_days'))::int, 7);
  created public.date_rounds%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_other is null or p_met is null or p_other = uid then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  perform private.lock_pair(uid, p_other);
  if not private.date_allowed(uid, p_other) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  perform private.expire_date_rounds(uid, p_other);
  me_a := uid < p_other;

  -- The same encounter is never counted twice (spec 35).
  if exists (
    select 1 from public.date_rounds
    where user_a = least(uid, p_other) and user_b = greatest(uid, p_other)
      and status = 'confirmed' and confirmed_at > now() - cooldown
  ) then
    return jsonb_build_object('ok', false, 'reason', 'cooldown');
  end if;

  select * into pending from public.date_rounds
    where user_a = least(uid, p_other) and user_b = greatest(uid, p_other) and status = 'open'
    for update;

  if pending.id is null then
    -- "Not yet" with nothing pending: nothing to remember, nothing to reveal.
    if not p_met then
      return jsonb_build_object('ok', true, 'state', 'ask');
    end if;
    select * into src from private.date_source(uid, p_other);
    insert into public.date_rounds (
      user_a, user_b, source, match_id, instant_session_id, closes_at,
      a_answer, a_answered_at, b_answer, b_answered_at)
    values (
      least(uid, p_other), greatest(uid, p_other), src.source, src.match_id, src.instant_session_id,
      now() + make_interval(days => window_days),
      case when me_a then true end, case when me_a then now() end,
      case when me_a then null else true end, case when me_a then null else now() end)
    returning * into created;
    return jsonb_build_object('ok', true, 'state', 'waiting', 'closes_at', created.closes_at);
  end if;

  if (case when me_a then pending.a_answer else pending.b_answer end) is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_answered');
  end if;

  -- A pending round always holds the other person's "yes".
  if p_met then
    update public.date_rounds
      set a_answer = coalesce(a_answer, true), a_answered_at = coalesce(a_answered_at, now()),
          b_answer = coalesce(b_answer, true), b_answered_at = coalesce(b_answered_at, now()),
          status = 'confirmed', confirmed_at = now(), closed_at = now()
      where id = pending.id;
    perform private.flag_date(pending.id);
    perform private.refresh_hot_person(uid);
    perform private.refresh_hot_person(p_other);
    perform realtime.send(jsonb_build_object('reason', 'date'), 'refresh', 'user:' || uid::text, true);
    perform realtime.send(jsonb_build_object('reason', 'date'), 'refresh', 'user:' || p_other::text, true);
    return jsonb_build_object('ok', true, 'state', 'confirmed');
  end if;

  update public.date_rounds
    set a_answer = coalesce(a_answer, false), a_answered_at = coalesce(a_answered_at, now()),
        b_answer = coalesce(b_answer, false), b_answered_at = coalesce(b_answered_at, now()),
        status = 'declined', closed_at = now()
    where id = pending.id;
  perform realtime.send(jsonb_build_object('reason', 'date'), 'refresh', 'user:' || p_other::text, true);
  return jsonb_build_object('ok', true, 'state', 'ask');
end;
$$;

------------------------------------------------------------------------------
-- get_my_dates: the owner's private progress (spec 36). Never shown to anyone else.
------------------------------------------------------------------------------
create function public.get_my_dates()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  window_days integer := coalesce((private.config_value('hot_person_window_days'))::int, 30);
  oldest timestamptz;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not private.is_eligible(uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;
  -- When the oldest counted date leaves the window (the count can only drop then).
  select min(confirmed_at) into oldest from public.date_rounds
    where uid in (user_a, user_b) and status = 'confirmed' and invalidated_at is null
      and confirmed_at > now() - make_interval(days => window_days);
  return jsonb_build_object(
    'ok', true,
    'active', private.is_hot_person(uid),
    'count', private.counted_dates(uid),
    'threshold', coalesce((private.config_value('hot_person_threshold'))::int, 3),
    'window_days', window_days,
    'distinct_partners', coalesce((private.config_value('hot_person_distinct_partners'))::boolean, true),
    'next_change', oldest + make_interval(days => window_days)
  );
end;
$$;

------------------------------------------------------------------------------
-- invalidate_date: moderators only (spec 35: "moderation may invalidate abuse").
------------------------------------------------------------------------------
create function public.invalidate_date(p_round uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  round public.date_rounds%rowtype;
begin
  if uid is null or not private.has_admin_role(uid, 'moderator') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  update public.date_rounds
    set invalidated_at = now(), invalidated_by = uid, invalidated_reason = left(trim(p_reason), 500)
    where id = p_round and status = 'confirmed' and invalidated_at is null
    returning * into round;
  if round.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  perform private.refresh_hot_person(round.user_a);
  perform private.refresh_hot_person(round.user_b);
  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (uid, 'date_invalidated', 'date_round', round.id::text, jsonb_build_object('reason', round.invalidated_reason));
  return jsonb_build_object('ok', true);
end;
$$;

------------------------------------------------------------------------------
-- A block voids anything pending between the two.
------------------------------------------------------------------------------
create function private.void_dates_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.date_rounds set status = 'void', closed_at = now()
    where status = 'open'
      and user_a = least(new.blocker_id, new.blocked_id) and user_b = greatest(new.blocker_id, new.blocked_id);
  return new;
end;
$$;
revoke all on function private.void_dates_on_block() from public, anon, authenticated;
create trigger on_block_void_dates
  after insert on public.blocks
  for each row execute function private.void_dates_on_block();

------------------------------------------------------------------------------
-- The badge on every card: computed live, so a date leaving the window removes it at once.
------------------------------------------------------------------------------
create or replace function private.profile_card(p_uid uuid, p_for_match boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', case when hidden.yes then null else p.display_name end,
    'anonymous', hidden.yes,
    'gender', p.gender,
    'age', private.age_of(a.date_of_birth),
    'verified', a.institutional_email_verified_at is not null,
    'hook', p.hook,
    'about', p.about,
    'zodiac', case when p.zodiac_visible then private.zodiac_for(a.date_of_birth) end,
    'hot_person', private.is_hot_person(p.id),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bucket', case when hidden.yes then 'profile-photos-blurred' else 'profile-photos' end,
        'path', case when hidden.yes then ph.blurred_path else ph.storage_path end
      ) order by ph.position)
      from public.profile_photos ph
      where ph.user_id = p.id and ph.status = 'approved'
    ), '[]'::jsonb)
  )
  from public.profiles p
  join public.account_private a on a.id = p.id
  cross join lateral (
    select p.privacy_mode = 'anonymous' and not (p_for_match and p.reveal_on_match) as yes
  ) hidden
  where p.id = p_uid;
$$;

------------------------------------------------------------------------------
-- get_my_profile: adds the owner's own badge.
------------------------------------------------------------------------------
create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'hook', p.hook,
    'about', p.about,
    'gender', p.gender,
    'privacy_mode', p.privacy_mode,
    'reveal_on_match', p.reveal_on_match,
    'read_receipts', p.read_receipts,
    'zodiac_visible', p.zodiac_visible,
    'zodiac', private.zodiac_for(a.date_of_birth),
    'age', case when a.date_of_birth is null then null
                else extract(year from age(current_date, a.date_of_birth))::int end,
    'verified', a.institutional_email_verified_at is not null,
    -- The owner's preview shows their own fire badge, exactly as others see it.
    'hot_person', private.is_hot_person(p.id),
    'complete', a.profile_completed_at is not null,
    'show_me', coalesce(to_jsonb(pr.show_me), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ph.id,
        'storage_path', ph.storage_path,
        'blurred_path', ph.blurred_path,
        'position', ph.position,
        'status', ph.status,
        'width', ph.width,
        'height', ph.height
      ) order by ph.position)
      from public.profile_photos ph where ph.user_id = p.id
    ), '[]'::jsonb)
  )
  from public.profiles p
  join public.account_private a on a.id = p.id
  left join public.preferences pr on pr.user_id = p.id
  where p.id = (select auth.uid());
$$;

------------------------------------------------------------------------------
-- Scheduled consistency check (spec 36): closes lapsed rounds and records badge changes for
-- dates that left the window. The public badge never waits for it.
------------------------------------------------------------------------------
create function private.dates_consistency()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
begin
  perform private.expire_date_rounds();
  for person in select user_id from private.hot_person_state where active loop
    perform private.refresh_hot_person(person);
  end loop;
end;
$$;
revoke all on function private.dates_consistency() from public, anon, authenticated;

select cron.schedule('soul-dates-consistency', '17 * * * *', 'select private.dates_consistency()');

revoke all on function public.date_state(uuid) from public, anon;
revoke all on function public.answer_date(uuid, boolean) from public, anon;
revoke all on function public.get_my_dates() from public, anon;
revoke all on function public.invalidate_date(uuid, text) from public, anon;
grant execute on function public.date_state(uuid) to authenticated;
grant execute on function public.answer_date(uuid, boolean) to authenticated;
grant execute on function public.get_my_dates() to authenticated;
grant execute on function public.invalidate_date(uuid, text) to authenticated;
