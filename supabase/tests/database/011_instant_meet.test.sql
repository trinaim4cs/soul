-- Phase 10: Instant Meet (DECISIONS D-011, D-031, D-050). Neutral identities only; positions
-- are test points around one base coordinate. Only this file's fixtures are counted.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(64);

create function pg_temp.mk(p_id uuid, p_gender public.gender, p_show public.gender[], p_plan text default 'monthly')
returns void language plpgsql as $$
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (p_id, 'test.user.' || right(p_id::text, 12) || '@srmist.edu.in', 'authenticated', 'authenticated', now());
  update public.account_private
    set terms_version = (select value ->> 'version' from public.app_config where key = 'current_terms_version'),
        terms_accepted_at = now(),
        date_of_birth = (current_date - interval '22 years 10 days')::date,
        profile_completed_at = now() - interval '30 days'
    where id = p_id;
  update public.profiles set display_name = 'Test User', hook = 'Hook', gender = p_gender where id = p_id;
  update public.preferences set show_me = p_show where user_id = p_id;
  insert into public.profile_photos (id, user_id, storage_path, blurred_path, position, status, source, width, height)
  values (p_id, p_id, p_id || '/' || p_id || '.jpg', p_id || '/' || p_id || '.jpg', 0, 'approved', 'camera', 1080, 1350);
  if p_plan is not null then
    insert into public.subscriptions (user_id, plan_id, starts_at, ends_at, source_key)
    values (p_id, p_plan, now() - interval '1 day', now() + interval '6 days', 'fixture:' || p_id);
  end if;
end $$;

-- Act as one account (the role stays `authenticated`).
create function pg_temp.act(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
-- Report the acting account's position as metres north and east of the base point.
create function pg_temp.locate(p_north double precision, p_east double precision, p_accuracy double precision default 12)
returns jsonb language sql as $$
  select public.instant_update_location(12.8230 + p_north / 110574.0, 80.0450 + p_east / 108600.0, p_accuracy);
$$;

select pg_temp.mk('000000a0-0000-4000-8000-000000000001', 'woman', '{man}');            -- V
select pg_temp.mk('000000a0-0000-4000-8000-0000000000a1', 'man', '{woman}');            -- M1, 900 m north
select pg_temp.mk('000000a0-0000-4000-8000-0000000000a2', 'man', '{woman}');            -- M2, 1.4 km north
select pg_temp.mk('000000a0-0000-4000-8000-0000000000a3', 'man', '{woman}', null);      -- M3, no plan
select pg_temp.mk('000000a0-0000-4000-8000-0000000000a4', 'man', '{woman}', 'weekly');  -- M4, weekly plan
select pg_temp.mk('000000a0-0000-4000-8000-0000000000a5', 'man', '{woman}');            -- M5, blocked by V
select pg_temp.mk('000000a0-0000-4000-8000-0000000000a6', 'man', '{man}');              -- M6, wants men
select pg_temp.mk('000000a0-0000-4000-8000-0000000000a7', 'man', '{woman}');            -- M7, nearby, Instant off
select pg_temp.mk('000000a0-0000-4000-8000-0000000000a8', 'man', '{woman}');            -- M8, nearby, joins later
select pg_temp.mk('000000a0-0000-4000-8000-0000000000a9', 'man', '{woman}');            -- M9, nearby, unmatched from V
select pg_temp.mk('000000a0-0000-4000-8000-0000000000aa', 'man', '{woman}');            -- M10, nearby, skipped by V
insert into public.matches (user_a, user_b, active, ended_at, ended_by)
values ('000000a0-0000-4000-8000-000000000001', '000000a0-0000-4000-8000-0000000000a9', false, now(),
        '000000a0-0000-4000-8000-000000000001');
insert into public.blocks (blocker_id, blocked_id)
values ('000000a0-0000-4000-8000-000000000001', '000000a0-0000-4000-8000-0000000000a5');

create view pg_temp.fixture_sessions as
  select * from public.instant_sessions where user_a::text like '000000a0-%' and user_b::text like '000000a0-%';

set local role authenticated;

-- ---------------------------------------------------------------- the plan gate and turning on
select pg_temp.act('000000a0-0000-4000-8000-0000000000a3');
select is(public.instant_start(30) ->> 'reason', 'no_plan', 'without a plan, Instant Meet cannot be turned on');
select pg_temp.act('000000a0-0000-4000-8000-0000000000a4');
select is(public.instant_start(30) ->> 'reason', 'no_plan', 'the weekly plan does not include Instant Meet');
select is(public.instant_state() -> 'entitled', 'false'::jsonb, 'and the state says so');

select pg_temp.act('000000a0-0000-4000-8000-000000000001');
select is(public.instant_start(45) ->> 'reason', 'invalid_duration', 'only 15, 30 or 60 minutes are accepted');
select is(pg_temp.locate(0, 0) ->> 'reason', 'not_active', 'a position is refused while Instant is off');
select is(public.instant_state() -> 'active', 'false'::jsonb, 'being signed in does not turn Instant on');
select is(public.instant_start(30) ->> 'ok', 'true', 'a monthly plan can turn Instant on');
select is(public.instant_state() -> 'located', 'false'::jsonb, 'on, but with no position yet');
select is(public.instant_update_location(123, 80, 10) ->> 'reason', 'invalid', 'impossible coordinates are refused');
select is(pg_temp.locate(0, 0) ->> 'ok', 'true', 'the device reports its own position');
select is(public.instant_state() - 'active_until',
  '{"ok": true, "entitled": true, "active": true, "located": true, "session": null}'::jsonb,
  'the state holds flags only, never the position');

-- ---------------------------------------------------------------- nobody can read positions
select throws_ok($$select count(*) from private.instant_presence$$, '42501', null,
  'the app cannot read stored positions');
select throws_ok($$select count(*) from private.instant_accepts$$, '42501', null,
  'the app cannot read who accepted whom');
select throws_ok($$select count(*) from public.instant_sessions$$, '42501', null,
  'the app cannot read sessions directly');
select throws_ok($$select private.instant_fix('000000a0-0000-4000-8000-000000000001')$$, '42501', null,
  'the app cannot call the internal position function');

-- ---------------------------------------------------------------- candidates within 1 km
select pg_temp.act('000000a0-0000-4000-8000-0000000000a1');
select public.instant_start(60);
select pg_temp.locate(900, 0);
select pg_temp.act('000000a0-0000-4000-8000-0000000000a2');
select public.instant_start(60);
select pg_temp.locate(1400, 0);
select pg_temp.act('000000a0-0000-4000-8000-0000000000a5');
select public.instant_start(60);
select pg_temp.locate(100, 0);
select pg_temp.act('000000a0-0000-4000-8000-0000000000a6');
select public.instant_start(60);
select pg_temp.locate(0, 100);
select pg_temp.act('000000a0-0000-4000-8000-0000000000a9');
select public.instant_start(60);
select pg_temp.locate(300, 0);

select pg_temp.act('000000a0-0000-4000-8000-000000000001');
select is(
  (select jsonb_agg(c ->> 'id') from jsonb_array_elements(public.instant_candidates() -> 'candidates') c),
  '["000000a0-0000-4000-8000-0000000000a1"]'::jsonb,
  'only the compatible, unblocked, never-unmatched person 900 m away is a candidate (1.4 km is not)');
select ok(not (public.instant_candidates() -> 'candidates' -> 0 ?| array['distance_m', 'bearing', 'location', 'latitude', 'longitude']),
  'a candidate card carries no distance, direction or position');
select ok(public.instant_candidates()::text !~ '12\.8[0-9]|80\.0[0-9]',
  'no coordinate appears anywhere in the candidate list');
select ok(private.can_view_photo_object('profile-photos',
    '000000a0-0000-4000-8000-0000000000a1/000000a0-0000-4000-8000-0000000000a1.jpg'),
  'a candidate''s photo can be signed');

-- "Not now" hides someone for the rest of this activation, in one direction only.
select pg_temp.act('000000a0-0000-4000-8000-0000000000aa');
select public.instant_start(60);
select pg_temp.locate(0, 500);
select pg_temp.act('000000a0-0000-4000-8000-000000000001');
select is(jsonb_array_length(public.instant_candidates() -> 'candidates'), 2, 'a second person nearby appears');
select is(public.instant_skip('000000a0-0000-4000-8000-0000000000aa') ->> 'ok', 'true', 'the caller can pass on someone');
select is(
  (select jsonb_agg(c ->> 'id') from jsonb_array_elements(public.instant_candidates() -> 'candidates') c),
  '["000000a0-0000-4000-8000-0000000000a1"]'::jsonb, 'who then stops being shown');
select is(public.instant_accept('000000a0-0000-4000-8000-0000000000aa') ->> 'reason', 'not_available',
  'and cannot be accepted after being passed on');
select pg_temp.act('000000a0-0000-4000-8000-0000000000aa');
select is(public.instant_accept('000000a0-0000-4000-8000-000000000001') -> 'session', 'null'::jsonb,
  'the skipped person is not told, and their acceptance starts nothing');
select public.instant_stop();

-- Accuracy and freshness.
select pg_temp.act('000000a0-0000-4000-8000-0000000000a1');
select pg_temp.locate(900, 0, 500);
select pg_temp.act('000000a0-0000-4000-8000-000000000001');
select is(jsonb_array_length(public.instant_candidates() -> 'candidates'), 0,
  'a position that is too inaccurate is not used');
reset role;
update private.instant_presence set accuracy_m = 12, located_at = now() - interval '5 minutes'
  where user_id = '000000a0-0000-4000-8000-0000000000a1';
set local role authenticated;
select is(jsonb_array_length(public.instant_candidates() -> 'candidates'), 0, 'a stale position is not used');
select pg_temp.act('000000a0-0000-4000-8000-0000000000a1');
select pg_temp.locate(900, 0);

-- ---------------------------------------------------------------- nothing before both accept
select pg_temp.act('000000a0-0000-4000-8000-000000000001');
select is(public.instant_accept('000000a0-0000-4000-8000-0000000000a2') ->> 'reason', 'not_available',
  'someone out of range cannot be accepted');
select is(public.instant_accept('000000a0-0000-4000-8000-0000000000a1') -> 'session', 'null'::jsonb,
  'one acceptance does not start a session');
select is(public.instant_state() -> 'session', 'null'::jsonb, 'and shares nothing');
select is(public.instant_candidates() -> 'candidates' -> 0 -> 'accepted', 'true'::jsonb,
  'the caller sees their own pending acceptance');
select pg_temp.act('000000a0-0000-4000-8000-0000000000a1');
select is(public.instant_candidates() -> 'candidates' -> 0 -> 'accepted', 'false'::jsonb,
  'the other person is not told who accepted them');

-- ---------------------------------------------------------------- mutual acceptance starts the session
select ok(public.instant_accept('000000a0-0000-4000-8000-000000000001') ->> 'session' is not null,
  'the second acceptance starts the session');
reset role;
select is((select count(*)::int from pg_temp.fixture_sessions where ended_at is null), 1, 'exactly one session exists');
set local role authenticated;
select is(public.instant_state() -> 'session' -> 'distance_m', '900'::jsonb, 'the distance is a rounded bucket');
select is(public.instant_state() -> 'session' -> 'bearing', '180'::jsonb, 'the bearing points from the caller to the other person');
select pg_temp.act('000000a0-0000-4000-8000-000000000001');
select is(public.instant_state() -> 'session' -> 'bearing', '0'::jsonb, 'and the other way round for the other person');
select ok(public.instant_state() -> 'session' ->> 'conversation_id' is not null, 'the session has its own chat');
select ok(public.instant_state()::text !~ '12\.8[0-9]|80\.0[0-9]'
          and not (public.instant_state() -> 'session' ?| array['location', 'latitude', 'longitude', 'accuracy_m']),
  'no coordinate appears anywhere in the session state');
select is(jsonb_array_length(public.instant_candidates() -> 'candidates'), 0,
  'someone in a session looks for nobody else');

select pg_temp.act('000000a0-0000-4000-8000-0000000000a8');
select public.instant_start(60);
select pg_temp.locate(50, 50);
select is(jsonb_array_length(public.instant_candidates() -> 'candidates'), 0,
  'and is nobody else''s candidate');
select is(public.instant_accept('000000a0-0000-4000-8000-000000000001') ->> 'reason', 'not_available',
  'nor can they be accepted by a third person');

-- ---------------------------------------------------------------- buckets
select pg_temp.act('000000a0-0000-4000-8000-0000000000a1');
select pg_temp.locate(0, 650);
select pg_temp.act('000000a0-0000-4000-8000-000000000001');
select is(public.instant_state() -> 'session' -> 'distance_m', '650'::jsonb, '650 m reads as ~650 m');
select is(public.instant_state() -> 'session' -> 'bearing', '90'::jsonb, 'due east is 90 degrees');
select pg_temp.act('000000a0-0000-4000-8000-0000000000a1');
select pg_temp.locate(438.217, 0);
select pg_temp.act('000000a0-0000-4000-8000-000000000001');
select is(public.instant_state() -> 'session' -> 'distance_m', '450'::jsonb, '438.217 m is never shown; it reads as ~450 m');
select pg_temp.act('000000a0-0000-4000-8000-0000000000a1');
select pg_temp.locate(40, 40);
select pg_temp.act('000000a0-0000-4000-8000-000000000001');
select is((public.instant_state() -> 'session') - array['id', 'person', 'started_at', 'expires_at', 'conversation_id'],
  '{"located": true, "nearby": true, "distance_m": null, "bearing": null}'::jsonb,
  'under 100 m there is only "nearby": no number and no direction');
select pg_temp.act('000000a0-0000-4000-8000-0000000000a1');
select pg_temp.locate(1240, 0);
select pg_temp.act('000000a0-0000-4000-8000-000000000001');
select is(public.instant_state() -> 'session' -> 'distance_m', '1200'::jsonb, 'beyond 1 km the steps are 100 m');
select pg_temp.act('000000a0-0000-4000-8000-0000000000a1');
select pg_temp.locate(300, 0, 900);
select pg_temp.act('000000a0-0000-4000-8000-000000000001');
select is(public.instant_state() -> 'session' -> 'located', 'false'::jsonb,
  'with an unusable position there is no distance at all, rather than a wrong one');

-- ---------------------------------------------------------------- session chat
reset role;
create temp table session_chat on commit drop as
  select c.id from public.conversations c join pg_temp.fixture_sessions s on s.id = c.instant_session_id
  where s.ended_at is null;
grant select on session_chat to authenticated;
set local role authenticated;
select is(public.send_message((select id from session_chat), 'on my way', gen_random_uuid()) ->> 'ok', 'true',
  'the two people can chat during the session');
select pg_temp.act('000000a0-0000-4000-8000-0000000000a8');
select is(public.send_message((select id from session_chat), 'hello', gen_random_uuid()) ->> 'reason', 'not_available',
  'nobody else can');

-- ---------------------------------------------------------------- End Meet
select pg_temp.act('000000a0-0000-4000-8000-0000000000a1');
select is(public.instant_end_session() ->> 'ended', 'true', 'either person ends the session, without asking the other');
select is(public.instant_state() - 'active_until',
  '{"ok": true, "entitled": true, "active": false, "located": false, "session": null}'::jsonb,
  'ending turns Instant off for the person who ended it');
select pg_temp.act('000000a0-0000-4000-8000-000000000001');
select is(public.instant_state() - 'active_until',
  '{"ok": true, "entitled": true, "active": false, "located": false, "session": null}'::jsonb,
  'and for the other person at the same moment');
select is(public.send_message((select id from session_chat), 'still there?', gen_random_uuid()) ->> 'reason',
  'not_available', 'the session chat closes with it');
reset role;
select is((select count(*)::int from private.instant_presence
           where user_id in ('000000a0-0000-4000-8000-000000000001', '000000a0-0000-4000-8000-0000000000a1')),
  0, 'both positions are deleted');
select is((select (ended_by, end_reason)::text from pg_temp.fixture_sessions),
  '(000000a0-0000-4000-8000-0000000000a1,ended)', 'the record keeps who ended it, and no position');

-- ---------------------------------------------------------------- expiry, stop and block
create function pg_temp.pair_up() returns void language plpgsql as $$
begin
  perform pg_temp.act('000000a0-0000-4000-8000-000000000001');
  perform public.instant_start(30);
  perform pg_temp.locate(0, 0);
  perform pg_temp.act('000000a0-0000-4000-8000-0000000000a7');
  perform public.instant_start(30);
  perform pg_temp.locate(200, 0);
  perform public.instant_accept('000000a0-0000-4000-8000-000000000001');
  perform pg_temp.act('000000a0-0000-4000-8000-000000000001');
  perform public.instant_accept('000000a0-0000-4000-8000-0000000000a7');
end $$;

set local role authenticated;
select pg_temp.pair_up();
reset role;
update public.instant_sessions set expires_at = now() - interval '1 second'
  where ended_at is null and user_a::text like '000000a0-%';
set local role authenticated;
select is(public.instant_state() -> 'session', 'null'::jsonb, 'a session ends by itself when its time is up');
reset role;
-- now() is fixed inside this transaction, so the sessions cannot be told apart by time.
select is((select count(*)::int from pg_temp.fixture_sessions where end_reason = 'expired'), 1,
  'and is recorded as expired');
select is((select count(*)::int from private.instant_presence
           where user_id in ('000000a0-0000-4000-8000-000000000001', '000000a0-0000-4000-8000-0000000000a7')),
  0, 'with both positions deleted');

set local role authenticated;
select pg_temp.pair_up();
select is(public.instant_stop() ->> 'ok', 'true', 'turning Instant off works during a session');
select pg_temp.act('000000a0-0000-4000-8000-0000000000a7');
select is(public.instant_state() -> 'session', 'null'::jsonb, 'and ends it for the other person too');

select pg_temp.pair_up();
reset role;
insert into public.blocks (blocker_id, blocked_id)
values ('000000a0-0000-4000-8000-0000000000a7', '000000a0-0000-4000-8000-000000000001');
set local role authenticated;
select is(public.instant_state() -> 'session', 'null'::jsonb, 'a block ends the session');
select is(jsonb_array_length(public.instant_candidates() -> 'candidates'), 0,
  'and the blocked person is never a candidate again');

-- ---------------------------------------------------------------- availability runs out
select pg_temp.act('000000a0-0000-4000-8000-0000000000a8');
select public.instant_start(15);
reset role;
update private.instant_presence set active_until = now() - interval '1 second'
  where user_id = '000000a0-0000-4000-8000-0000000000a8';
set local role authenticated;
select is(public.instant_state() -> 'active', 'false'::jsonb, 'Instant turns itself off when the chosen time is up');
reset role;
select is((select count(*)::int from private.instant_presence where user_id = '000000a0-0000-4000-8000-0000000000a8'),
  0, 'and the position is deleted, not kept');

select * from finish();
rollback;
