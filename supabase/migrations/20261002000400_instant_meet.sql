-- SOUL Phase 10: Instant Meet (spec v2 sections 26 to 34, DECISIONS D-011, D-031, D-050).
--
-- The only feature that uses location. The rules this file enforces:
--   * only people on a plan with Instant Meet, and only after they turn it on
--   * a device sends its own position to the server; no function ever returns coordinates,
--     and the tables that hold them are in the private schema, unreachable by any client
--   * candidates are compatible, Instant-active people within 1 km (server-side PostGIS)
--   * nothing about distance or direction is shared before both people accept
--   * during a session each person gets a rounded distance and a 15-degree bearing only;
--     under 100 m only "nearby", with no bearing
--   * either person ends it at once; positions are deleted when Instant ends

insert into public.app_config (key, value, client_visible, description) values
  ('instant_radius_m', '1000', true, 'Instant Meet search radius in metres (D-031).'),
  ('instant_session_minutes', '30', true, 'How long an Instant Meet session lasts.'),
  ('instant_fix_max_age_seconds', '90', false, 'A position older than this is not used.'),
  ('instant_fix_max_accuracy_m', '200', false, 'A position less accurate than this is not used.')
on conflict (key) do nothing;

------------------------------------------------------------------------------
-- Private state. No policies, no grants, not in an exposed schema.
------------------------------------------------------------------------------
create table private.instant_presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active_until timestamptz not null,
  location extensions.geography(Point, 4326),
  accuracy_m real,
  located_at timestamptz,
  started_at timestamptz not null default now()
);
create index instant_presence_location_idx on private.instant_presence using gist (location);

-- "I would meet this person now." A session starts when both rows exist.
create table private.instant_accepts (
  user_id uuid not null references auth.users (id) on delete cascade,
  candidate_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, candidate_id)
);

-- "Not now": hidden for the rest of this activation.
create table private.instant_skips (
  user_id uuid not null references auth.users (id) on delete cascade,
  candidate_id uuid not null references auth.users (id) on delete cascade,
  primary key (user_id, candidate_id)
);

-- The record that a session happened: who and when, never where.
create table public.instant_sessions (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  ended_by uuid,
  end_reason text,
  constraint instant_pair_ordered check (user_a < user_b),
  constraint instant_end_reason_valid check (
    end_reason is null or end_reason in ('ended', 'expired', 'stopped', 'unavailable'))
);
create index instant_sessions_a_idx on public.instant_sessions (user_a) where ended_at is null;
create index instant_sessions_b_idx on public.instant_sessions (user_b) where ended_at is null;
alter table public.instant_sessions enable row level security;
alter table public.instant_sessions force row level security;
revoke all on public.instant_sessions from anon, authenticated;

-- A session has its own short-lived conversation (the two people may not be matched).
alter table public.conversations alter column match_id drop not null;
alter table public.conversations
  add column instant_session_id uuid unique references public.instant_sessions (id) on delete cascade,
  add constraint conversation_has_one_owner check ((match_id is null) <> (instant_session_id is null));

------------------------------------------------------------------------------
-- Helpers.
------------------------------------------------------------------------------
create function private.has_instant(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.user_id = p_user and s.status = 'active' and p.includes_instant
      and s.starts_at <= now() and s.ends_at > now()
  );
$$;
revoke all on function private.has_instant(uuid) from public, anon, authenticated;

/**
 * Could these two meet? Both eligible, no block, never unmatched, each inside the other's
 * gender and age preferences, both with an approved main photo. Turning Instant on is an
 * explicit choice to be found nearby, so private mode does not hide someone here.
 */
create function private.instant_compatible(p_one uuid, p_other uuid)
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
    and not exists (
      select 1 from public.matches m
      where m.user_a = least(p_one, p_other) and m.user_b = greatest(p_one, p_other) and not m.active)
    and exists (
      select 1
      from public.profiles ap
      join public.preferences apr on apr.user_id = ap.id
      join public.account_private aa on aa.id = ap.id
      cross join public.profiles bp
      join public.preferences bpr on bpr.user_id = bp.id
      join public.account_private ba on ba.id = bp.id
      where ap.id = p_one and bp.id = p_other
        and bp.gender = any (apr.show_me)
        and ap.gender = any (bpr.show_me)
        and private.age_of(aa.date_of_birth) between bpr.min_age and bpr.max_age
        and private.age_of(ba.date_of_birth) between apr.min_age and apr.max_age
        and exists (select 1 from public.profile_photos ph
                    where ph.user_id = ap.id and ph.position = 0 and ph.status = 'approved')
        and exists (select 1 from public.profile_photos ph
                    where ph.user_id = bp.id and ph.position = 0 and ph.status = 'approved')
    );
$$;
revoke all on function private.instant_compatible(uuid, uuid) from public, anon, authenticated;

/** A position that may be used: Instant still on, recent and accurate enough. */
create function private.instant_fix(p_user uuid)
returns extensions.geography
language sql
stable
security definer
set search_path = ''
as $$
  select location from private.instant_presence
  where user_id = p_user
    and active_until > now()
    and location is not null
    and located_at > now() - make_interval(
      secs => coalesce((private.config_value('instant_fix_max_age_seconds'))::int, 90))
    and accuracy_m <= coalesce((private.config_value('instant_fix_max_accuracy_m'))::int, 200);
$$;
revoke all on function private.instant_fix(uuid) from public, anon, authenticated;

create function private.active_instant_session(p_user uuid)
returns public.instant_sessions
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.instant_sessions
  where p_user in (user_a, user_b) and ended_at is null and expires_at > now()
  order by started_at desc
  limit 1;
$$;
revoke all on function private.active_instant_session(uuid) from public, anon, authenticated;

/** Ends a session: stops Instant for both people, deletes their positions, closes the chat. */
create function private.end_instant_session(p_session uuid, p_by uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.instant_sessions%rowtype;
  conversation uuid;
begin
  update public.instant_sessions
    set ended_at = now(), ended_by = p_by, end_reason = p_reason
    where id = p_session and ended_at is null
    returning * into session;
  if not found then
    return;
  end if;
  delete from private.instant_presence where user_id in (session.user_a, session.user_b);
  delete from private.instant_accepts
    where user_id in (session.user_a, session.user_b) or candidate_id in (session.user_a, session.user_b);
  delete from private.instant_skips where user_id in (session.user_a, session.user_b);
  update public.conversations set closed_at = now()
    where instant_session_id = p_session and closed_at is null
    returning id into conversation;
  if conversation is not null then
    perform realtime.send(jsonb_build_object('conversation_id', conversation), 'closed',
                          'chat:' || conversation::text, true);
  end if;
  perform realtime.send(jsonb_build_object('reason', 'instant'), 'refresh', 'user:' || session.user_a::text, true);
  perform realtime.send(jsonb_build_object('reason', 'instant'), 'refresh', 'user:' || session.user_b::text, true);
end;
$$;
revoke all on function private.end_instant_session(uuid, uuid, text) from public, anon, authenticated;

/** Housekeeping run by every Instant call: expired sessions end, expired presence is deleted. */
create function private.instant_sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired record;
begin
  for expired in
    select id from public.instant_sessions where ended_at is null and expires_at <= now()
  loop
    perform private.end_instant_session(expired.id, null, 'expired');
  end loop;
  delete from private.instant_accepts a
    using private.instant_presence p
    where p.active_until <= now() and (a.user_id = p.user_id or a.candidate_id = p.user_id);
  delete from private.instant_skips s
    using private.instant_presence p
    where p.active_until <= now() and s.user_id = p.user_id;
  delete from private.instant_presence where active_until <= now();
end;
$$;
revoke all on function private.instant_sweep() from public, anon, authenticated;

-- Chat access now also covers a live Instant session's conversation.
create or replace function private.can_use_conversation(p_user uuid, p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    join public.matches m on m.id = c.match_id
    where c.id = p_conversation
      and c.closed_at is null
      and m.active
      and p_user in (m.user_a, m.user_b)
      and private.can_view_match(p_user, case when m.user_a = p_user then m.user_b else m.user_a end)
  ) or exists (
    select 1
    from public.conversations c
    join public.instant_sessions s on s.id = c.instant_session_id
    cross join lateral (select case when s.user_a = p_user then s.user_b else s.user_a end as other) o
    where c.id = p_conversation
      and c.closed_at is null
      and s.ended_at is null
      and s.expires_at > now()
      and p_user in (s.user_a, s.user_b)
      and private.is_eligible(p_user)
      and private.is_eligible(o.other)
      and not private.is_blocked(p_user, o.other)
  );
$$;

------------------------------------------------------------------------------
-- instant_start / instant_stop / instant_update_location
------------------------------------------------------------------------------
create function public.instant_start(p_minutes integer)
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

-- Turning Instant off ends everything at once: any session, the position, pending accepts.
create function public.instant_stop()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  session public.instant_sessions%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  session := private.active_instant_session(uid);
  if session.id is not null then
    perform private.end_instant_session(session.id, uid, 'stopped');
  end if;
  delete from private.instant_presence where user_id = uid;
  delete from private.instant_accepts where user_id = uid or candidate_id = uid;
  delete from private.instant_skips where user_id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- The device reports its own position. Nothing is returned but success.
create function public.instant_update_location(
  p_latitude double precision, p_longitude double precision, p_accuracy double precision
)
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
  if p_latitude is null or p_longitude is null or p_accuracy is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
     or p_accuracy < 0 or p_accuracy > 100000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  update private.instant_presence
    set location = extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
        accuracy_m = p_accuracy,
        located_at = now()
    where user_id = uid and active_until > now();
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

------------------------------------------------------------------------------
-- Candidates: compatible, Instant-active, entitled people within the radius. No distance,
-- no direction, no ordering by closeness. A person in a session is nobody's candidate.
------------------------------------------------------------------------------
create function private.instant_candidate_ids(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.user_id
  from private.instant_presence o
  where o.user_id <> p_user
    and private.instant_fix(p_user) is not null
    and private.instant_fix(o.user_id) is not null
    and extensions.st_dwithin(
      private.instant_fix(p_user), o.location,
      coalesce((private.config_value('instant_radius_m'))::int, 1000))
    and private.has_instant(o.user_id)
    and private.instant_compatible(p_user, o.user_id)
    and (private.active_instant_session(o.user_id)).id is null
    and not exists (
      select 1 from private.instant_skips s where s.user_id = p_user and s.candidate_id = o.user_id);
$$;
revoke all on function private.instant_candidate_ids(uuid) from public, anon, authenticated;

/**
 * May p_viewer see p_other's card and photos through Instant? Yes while p_other is one of
 * their candidates, or while the two are in a live session.
 */
create function private.instant_visible(p_viewer uuid, p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and (
    exists (
      select 1 from public.instant_sessions s
      where s.ended_at is null and s.expires_at > now()
        and s.user_a = least(p_viewer, p_other) and s.user_b = greatest(p_viewer, p_other)
        and not private.is_blocked(p_viewer, p_other))
    or (
      private.has_instant(p_viewer)
      and (private.active_instant_session(p_viewer)).id is null
      and p_other in (select private.instant_candidate_ids(p_viewer)))
  );
$$;
revoke all on function private.instant_visible(uuid, uuid) from public, anon, authenticated;

/** Photos of the person in a live session can be signed, as for a match (same reveal rule). */
create or replace function private.can_view_photo_object(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profile_photos ph
    join public.profiles p on p.id = ph.user_id
    where ph.status = 'approved'
      and (
        (p_bucket = 'profile-photos' and ph.storage_path = p_name)
        or (p_bucket = 'profile-photos-blurred' and ph.blurred_path = p_name)
      )
      and case
        when p_bucket = 'profile-photos' and p.privacy_mode = 'anonymous' then
          p.reveal_on_match and private.can_view_match((select auth.uid()), ph.user_id)
        else
          private.can_view_profile((select auth.uid()), ph.user_id)
          or private.can_view_match((select auth.uid()), ph.user_id)
          or private.instant_visible((select auth.uid()), ph.user_id)
      end
  );
$$;

create function public.instant_candidates()
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
  if not private.has_instant(uid) or (private.active_instant_session(uid)).id is not null then
    return jsonb_build_object('ok', true, 'candidates', '[]'::jsonb);
  end if;
  return jsonb_build_object('ok', true, 'candidates', coalesce((
    select jsonb_agg(
      private.profile_card(c.id) || jsonb_build_object(
        'accepted', exists (select 1 from private.instant_accepts a
                            where a.user_id = uid and a.candidate_id = c.id))
      -- A stable order that says nothing about who is closer.
      order by md5(uid::text || c.id::text))
    from (select private.instant_candidate_ids(uid) as id limit 20) c
  ), '[]'::jsonb));
end;
$$;

------------------------------------------------------------------------------
-- instant_accept / instant_skip. The session starts only when both have accepted, in one
-- transaction under the pair lock, and only if both are still free and still in range.
------------------------------------------------------------------------------
create function public.instant_accept(p_candidate uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  session_id uuid;
  conversation uuid;
  ends timestamptz;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_candidate is null or p_candidate = uid then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  perform private.instant_sweep();
  perform private.lock_pair(uid, p_candidate);

  if not private.has_instant(uid) or (private.active_instant_session(uid)).id is not null
     or p_candidate not in (select private.instant_candidate_ids(uid)) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  insert into private.instant_accepts (user_id, candidate_id) values (uid, p_candidate)
  on conflict do nothing;

  if not exists (
    select 1 from private.instant_accepts where user_id = p_candidate and candidate_id = uid
  ) then
    return jsonb_build_object('ok', true, 'session', null);
  end if;

  ends := now() + make_interval(
    mins => coalesce((private.config_value('instant_session_minutes'))::int, 30));
  insert into public.instant_sessions (user_a, user_b, expires_at)
  values (least(uid, p_candidate), greatest(uid, p_candidate), ends)
  returning id into session_id;
  -- Both keep Instant on for the whole session, so positions keep flowing.
  update private.instant_presence set active_until = greatest(active_until, ends)
    where user_id in (uid, p_candidate);
  delete from private.instant_accepts
    where user_id in (uid, p_candidate) or candidate_id in (uid, p_candidate);
  insert into public.conversations (instant_session_id) values (session_id) returning id into conversation;
  insert into public.conversation_members (conversation_id, user_id)
  values (conversation, uid), (conversation, p_candidate);
  perform realtime.send(jsonb_build_object('reason', 'instant'), 'refresh', 'user:' || uid::text, true);
  perform realtime.send(jsonb_build_object('reason', 'instant'), 'refresh', 'user:' || p_candidate::text, true);
  return jsonb_build_object('ok', true, 'session', session_id);
end;
$$;

create function public.instant_skip(p_candidate uuid)
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
  if p_candidate is null or p_candidate = uid then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if not exists (select 1 from private.instant_presence where user_id = uid and active_until > now()) then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;
  insert into private.instant_skips (user_id, candidate_id) values (uid, p_candidate)
  on conflict do nothing;
  delete from private.instant_accepts where user_id = uid and candidate_id = p_candidate;
  return jsonb_build_object('ok', true);
end;
$$;

------------------------------------------------------------------------------
-- instant_state: everything the Instant screens need, and nothing more. During a session:
-- a rounded distance (50 m steps under 1 km, 100 m steps beyond) and a bearing in 15-degree
-- steps; under 100 m only `nearby`, with no number and no bearing.
------------------------------------------------------------------------------
create function public.instant_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  presence private.instant_presence%rowtype;
  session public.instant_sessions%rowtype;
  other uuid;
  mine extensions.geography;
  theirs extensions.geography;
  metres double precision;
  session_json jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform private.instant_sweep();
  if not private.is_eligible(uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;

  select * into presence from private.instant_presence where user_id = uid and active_until > now();
  session := private.active_instant_session(uid);

  if session.id is not null then
    other := case when session.user_a = uid then session.user_b else session.user_a end;
    -- A block, a suspension or a lost plan ends the session for both.
    if private.is_blocked(uid, other) or not private.is_eligible(other) then
      perform private.end_instant_session(session.id, null, 'unavailable');
      session := null;
    end if;
  end if;

  if session.id is not null then
    mine := private.instant_fix(uid);
    theirs := private.instant_fix(other);
    if mine is not null and theirs is not null then
      metres := extensions.st_distance(mine, theirs);
    end if;
    session_json := jsonb_build_object(
      'id', session.id,
      'person', private.profile_card(other),
      'started_at', session.started_at,
      'expires_at', session.expires_at,
      'conversation_id', (select id from public.conversations where instant_session_id = session.id),
      -- false while either position is missing, stale or too inaccurate
      'located', metres is not null,
      'nearby', metres is not null and metres < 100,
      'distance_m', case
        when metres is null or metres < 100 then null
        when metres < 1000 then greatest(100, (round(metres / 50.0) * 50)::int)
        else (round(metres / 100.0) * 100)::int end,
      'bearing', case
        when metres is null or metres < 100 then null
        else ((round(degrees(extensions.st_azimuth(mine, theirs)) / 15.0) * 15)::int % 360) end
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'entitled', private.has_instant(uid),
    'active', presence.user_id is not null,
    'active_until', presence.active_until,
    -- whether the server has a usable position for the caller (never the position itself)
    'located', private.instant_fix(uid) is not null,
    'session', session_json
  );
end;
$$;

create function public.instant_end_session()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  session public.instant_sessions%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  session := private.active_instant_session(uid);
  if session.id is null then
    return jsonb_build_object('ok', true, 'ended', false);
  end if;
  perform private.end_instant_session(session.id, uid, 'ended');
  return jsonb_build_object('ok', true, 'ended', true);
end;
$$;

revoke all on function public.instant_start(integer) from public, anon;
revoke all on function public.instant_stop() from public, anon;
revoke all on function public.instant_update_location(double precision, double precision, double precision) from public, anon;
revoke all on function public.instant_candidates() from public, anon;
revoke all on function public.instant_accept(uuid) from public, anon;
revoke all on function public.instant_skip(uuid) from public, anon;
revoke all on function public.instant_state() from public, anon;
revoke all on function public.instant_end_session() from public, anon;
grant execute on function public.instant_start(integer) to authenticated;
grant execute on function public.instant_stop() to authenticated;
grant execute on function public.instant_update_location(double precision, double precision, double precision) to authenticated;
grant execute on function public.instant_candidates() to authenticated;
grant execute on function public.instant_accept(uuid) to authenticated;
grant execute on function public.instant_skip(uuid) to authenticated;
grant execute on function public.instant_state() to authenticated;
grant execute on function public.instant_end_session() to authenticated;
