-- Phase 11: "Did you meet?" and the fire badge (spec 35, 36; DECISIONS D-017, D-051).
-- Neutral identities only. Only this file's fixtures are counted.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(63);

create function pg_temp.mk(p_id uuid, p_gender public.gender, p_show public.gender[])
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
end $$;

create function pg_temp.match(p_one uuid, p_other uuid) returns void language sql as $$
  insert into public.matches (user_a, user_b) values (least(p_one, p_other), greatest(p_one, p_other));
$$;

create function pg_temp.act(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- A counted date written directly (badge arithmetic), `p_days_ago` days in the past.
create function pg_temp.dated(p_one uuid, p_other uuid, p_days_ago numeric) returns void language sql as $$
  insert into public.date_rounds (user_a, user_b, source, status, opened_at, closes_at, a_answer, b_answer,
                                  a_answered_at, b_answered_at, confirmed_at, closed_at)
  values (least(p_one, p_other), greatest(p_one, p_other), 'match', 'confirmed',
          now() - make_interval(secs => p_days_ago * 86400) - interval '1 hour',
          now() - make_interval(secs => p_days_ago * 86400) + interval '6 days', true, true,
          now() - make_interval(secs => p_days_ago * 86400), now() - make_interval(secs => p_days_ago * 86400),
          now() - make_interval(secs => p_days_ago * 86400), now() - make_interval(secs => p_days_ago * 86400));
$$;

create view pg_temp.rounds as
  select * from public.date_rounds where user_a::text like '000000d0-%' and user_b::text like '000000d0-%';

select pg_temp.mk('000000d0-0000-4000-8000-000000000001', 'woman', '{man}');   -- W
select pg_temp.mk('000000d0-0000-4000-8000-0000000000a1', 'man', '{woman}');   -- M1, matched
select pg_temp.mk('000000d0-0000-4000-8000-0000000000a2', 'man', '{woman}');   -- M2, matched
select pg_temp.mk('000000d0-0000-4000-8000-0000000000a3', 'man', '{woman}');   -- M3, matched
select pg_temp.mk('000000d0-0000-4000-8000-0000000000a4', 'man', '{woman}');   -- M4, never matched
select pg_temp.mk('000000d0-0000-4000-8000-0000000000a5', 'man', '{woman}');   -- M5, Instant Meet yesterday
select pg_temp.mk('000000d0-0000-4000-8000-0000000000a6', 'man', '{woman}');   -- M6, Instant Meet 10 days ago
select pg_temp.mk('000000d0-0000-4000-8000-0000000000a7', 'man', '{woman}');   -- M7, matched, later blocked
select pg_temp.mk('000000d0-0000-4000-8000-0000000000a8', 'man', '{woman}');   -- M8, matched, later unmatched
select pg_temp.mk('000000d0-0000-4000-8000-0000000000b1', 'woman', '{man}');   -- moderator
select pg_temp.match('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a1');
select pg_temp.match('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a2');
select pg_temp.match('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a3');
select pg_temp.match('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a7');
select pg_temp.match('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a8');
insert into public.instant_sessions (user_a, user_b, started_at, expires_at, ended_at, end_reason) values
  ('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a5',
   now() - interval '1 day', now() - interval '1 day' + interval '30 minutes', now() - interval '23 hours', 'ended'),
  ('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a6',
   now() - interval '10 days', now() - interval '10 days' + interval '30 minutes', now() - interval '10 days', 'ended');
insert into public.admin_roles (user_id, role) values ('000000d0-0000-4000-8000-0000000000b1', 'moderator');

set local role authenticated;

-- ---------------------------------------------------------------- nothing is readable directly
select pg_temp.act('000000d0-0000-4000-8000-000000000001');
select throws_ok($$select count(*) from public.date_rounds$$, '42501', null, 'the app cannot read date answers');
select throws_ok($$select count(*) from public.date_review_flags$$, '42501', null, 'nor the review flags');
select throws_ok($$select count(*) from private.hot_person_state$$, '42501', null, 'nor the stored badge state');
select throws_ok($$insert into public.date_rounds (user_a, user_b, source, closes_at) values
  ('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a1', 'match', now())$$,
  '42501', null, 'nor write a date itself');
select throws_ok($$select private.is_hot_person('000000d0-0000-4000-8000-000000000001')$$, '42501', null,
  'nor call the badge function');

-- ---------------------------------------------------------------- only a real encounter
select is(public.date_state('000000d0-0000-4000-8000-0000000000a4') ->> 'reason', 'not_available',
  'someone never matched cannot be confirmed');
select is(public.answer_date('000000d0-0000-4000-8000-0000000000a4', true) ->> 'reason', 'not_available',
  'and a yes for them is refused');
select is(public.answer_date('000000d0-0000-4000-8000-000000000001', true) ->> 'reason', 'invalid',
  'nobody dates themselves');
select is(public.date_state('000000d0-0000-4000-8000-0000000000a5') ->> 'source', 'instant',
  'an Instant Meet from yesterday can be confirmed');
select is(public.date_state('000000d0-0000-4000-8000-0000000000a6') ->> 'reason', 'not_available',
  'one from ten days ago cannot');
select is(public.date_state('000000d0-0000-4000-8000-0000000000a1') ->> 'state', 'ask', 'a match starts at "Did you meet?"');
select ok(public.date_state('000000d0-0000-4000-8000-0000000000a1') -> 'person' ->> 'id' = '000000d0-0000-4000-8000-0000000000a1',
  'with the other person''s card');

-- ---------------------------------------------------------------- answers stay private
select is(public.answer_date('000000d0-0000-4000-8000-0000000000a1', false) ->> 'state', 'ask',
  '"Not yet" with nothing pending is accepted');
reset role;
select is((select count(*)::int from pg_temp.rounds), 0, 'and stores nothing at all');
set local role authenticated;

select is(public.answer_date('000000d0-0000-4000-8000-0000000000a1', true) ->> 'state', 'waiting',
  'a first yes waits for the other person');
select is(public.date_state('000000d0-0000-4000-8000-0000000000a1') ->> 'state', 'waiting',
  'the person who said yes sees that they are waiting');
select is(public.answer_date('000000d0-0000-4000-8000-0000000000a1', false) ->> 'reason', 'already_answered',
  'an answer is final for the round');
select pg_temp.act('000000d0-0000-4000-8000-0000000000a1');
select is(public.date_state('000000d0-0000-4000-8000-000000000001') - 'person',
  '{"ok": true, "source": "match", "state": "ask", "closes_at": null, "next_at": null, "last": null}'::jsonb,
  'the other person sees exactly what they saw before: no hint of the yes');

-- ---------------------------------------------------------------- both yes: a date
select is(public.answer_date('000000d0-0000-4000-8000-000000000001', true) ->> 'state', 'confirmed',
  'the second yes confirms the date');
select is(public.date_state('000000d0-0000-4000-8000-000000000001') ->> 'state', 'confirmed', 'for one');
select pg_temp.act('000000d0-0000-4000-8000-000000000001');
select is(public.date_state('000000d0-0000-4000-8000-0000000000a1') ->> 'state', 'confirmed', 'and the other');
select ok((public.date_state('000000d0-0000-4000-8000-0000000000a1') ->> 'next_at')::timestamptz > now(),
  'with the time another date with them could count');
select is(public.answer_date('000000d0-0000-4000-8000-0000000000a1', true) ->> 'reason', 'cooldown',
  'the same encounter is never counted twice');
reset role;
select is((select count(*)::int from pg_temp.rounds where status = 'confirmed'), 1, 'exactly one date is stored');
set local role authenticated;
select is(public.get_my_dates() - 'next_change',
  '{"ok": true, "active": false, "count": 1, "threshold": 3, "window_days": 30, "distinct_partners": true}'::jsonb,
  'the owner sees their private progress');

-- ---------------------------------------------------------------- one yes, one no
select is(public.answer_date('000000d0-0000-4000-8000-0000000000a2', true) ->> 'state', 'waiting', 'a yes for M2');
select pg_temp.act('000000d0-0000-4000-8000-0000000000a2');
select is(public.answer_date('000000d0-0000-4000-8000-000000000001', false) ->> 'state', 'ask',
  'M2 says not yet, and learns nothing from it');
select is(public.date_state('000000d0-0000-4000-8000-000000000001') -> 'last', 'null'::jsonb,
  'the person who said no gets no note');
select pg_temp.act('000000d0-0000-4000-8000-000000000001');
select is(public.date_state('000000d0-0000-4000-8000-0000000000a2') -> 'last' ->> 'outcome', 'not_counted',
  'once both answered, the yes is told it did not count');
select is(public.date_state('000000d0-0000-4000-8000-0000000000a2') ->> 'state', 'ask', 'and can ask again later');
reset role;
select is((select status from pg_temp.rounds where user_b = '000000d0-0000-4000-8000-0000000000a2'), 'declined',
  'the round is closed as declined');
set local role authenticated;

-- ---------------------------------------------------------------- a yes that is never answered
select is(public.answer_date('000000d0-0000-4000-8000-0000000000a3', true) ->> 'state', 'waiting', 'a yes for M3');
reset role;
update public.date_rounds set closes_at = now() - interval '1 second'
  where user_b = '000000d0-0000-4000-8000-0000000000a3' and status = 'open';
set local role authenticated;
select is(public.date_state('000000d0-0000-4000-8000-0000000000a3') -> 'last' ->> 'outcome', 'expired',
  'after the window, the yes is told it ran out');
select pg_temp.act('000000d0-0000-4000-8000-0000000000a3');
select is(public.answer_date('000000d0-0000-4000-8000-000000000001', true) ->> 'state', 'waiting',
  'a late yes starts a new round instead of completing the old one');
reset role;
select is((select count(*)::int from pg_temp.rounds where user_b = '000000d0-0000-4000-8000-0000000000a3' and status = 'expired'),
  1, 'the old round is expired');
set local role authenticated;

-- ---------------------------------------------------------------- the source must still be real
select pg_temp.act('000000d0-0000-4000-8000-000000000001');
select is(public.answer_date('000000d0-0000-4000-8000-0000000000a7', true) ->> 'state', 'waiting', 'a yes for M7');
select is(public.answer_date('000000d0-0000-4000-8000-0000000000a5', true) ->> 'state', 'waiting',
  'a yes after an Instant Meet');
reset role;
select is((select source from pg_temp.rounds where user_b = '000000d0-0000-4000-8000-0000000000a5'), 'instant',
  'recorded as an Instant Meet date');
insert into public.blocks (blocker_id, blocked_id)
values ('000000d0-0000-4000-8000-0000000000a7', '000000d0-0000-4000-8000-000000000001');
select is((select status from pg_temp.rounds where user_b = '000000d0-0000-4000-8000-0000000000a7'), 'void',
  'a block voids anything pending');
update public.matches set active = false, ended_at = now(), ended_by = '000000d0-0000-4000-8000-0000000000a8'
  where user_b = '000000d0-0000-4000-8000-0000000000a8';
set local role authenticated;
select is(public.date_state('000000d0-0000-4000-8000-0000000000a7') ->> 'reason', 'not_available',
  'a blocked pair cannot confirm');
select is(public.answer_date('000000d0-0000-4000-8000-0000000000a8', true) ->> 'reason', 'not_available',
  'nor an unmatched one');

-- ---------------------------------------------------------------- the badge: 3 in 30 days
reset role;
delete from public.date_rounds where user_a::text like '000000d0-%';
select pg_temp.dated('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a1', 2);
select pg_temp.dated('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a2', 10);
set local role authenticated;
select pg_temp.act('000000d0-0000-4000-8000-000000000001');
select is(public.get_my_dates() -> 'active', 'false'::jsonb, 'two dates: no badge');
reset role;
select pg_temp.dated('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a3', 29.99);
set local role authenticated;
select is(public.get_my_dates() -> 'count', '3'::jsonb, 'a date 29.99 days ago still counts');
select is(public.get_my_dates() -> 'active', 'true'::jsonb, 'three dates in 30 days: the badge');
select is(public.get_my_profile() -> 'hot_person', 'true'::jsonb, 'the owner''s own preview shows it too');
select ok(abs(extract(epoch from (public.get_my_dates() ->> 'next_change')::timestamptz
                                 - (now() + interval '0.01 day'))) < 60,
  'the owner is told when the oldest date leaves the window');
select pg_temp.act('000000d0-0000-4000-8000-0000000000a4');
select ok((select (c ->> 'hot_person')::boolean from public.discovery_feed(null, 50) d,
           jsonb_array_elements(d -> 'cards') c
           where c ->> 'id' = '000000d0-0000-4000-8000-000000000001'),
  'other people see the badge on the card');
select ok(not (select c ?| array['count', 'dates', 'date_count', 'hot_person_count']
               from public.discovery_feed(null, 50) d, jsonb_array_elements(d -> 'cards') c
               where c ->> 'id' = '000000d0-0000-4000-8000-000000000001'),
  'but only a true or false, never a number');

reset role;
update public.date_rounds set confirmed_at = now() - interval '30 days 1 minute'
  where user_b = '000000d0-0000-4000-8000-0000000000a3';
set local role authenticated;
select is(public.get_my_dates() -> 'active', 'false'::jsonb, 'a date older than 30 days drops out: no badge');
select pg_temp.act('000000d0-0000-4000-8000-0000000000a4');
select ok(not (select (c ->> 'hot_person')::boolean from public.discovery_feed(null, 50) d,
               jsonb_array_elements(d -> 'cards') c
               where c ->> 'id' = '000000d0-0000-4000-8000-000000000001'),
  'and the card loses it at the same moment');

-- Three dates with the same person count once (C-14 default).
reset role;
delete from public.date_rounds where user_a::text like '000000d0-%';
select pg_temp.dated('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a1', 1);
select pg_temp.dated('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a1', 3);
select pg_temp.dated('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a1', 5);
set local role authenticated;
select pg_temp.act('000000d0-0000-4000-8000-000000000001');
select is(public.get_my_dates() -> 'count', '1'::jsonb, 'three dates with one person count as one');
select is(public.get_my_dates() -> 'active', 'false'::jsonb, 'so they do not earn the badge');
reset role;
update public.app_config set value = 'false' where key = 'hot_person_distinct_partners';
set local role authenticated;
select is(public.get_my_dates() -> 'count', '3'::jsonb, 'the rule is server config');
reset role;
update public.app_config set value = 'true' where key = 'hot_person_distinct_partners';

-- ---------------------------------------------------------------- earned through answers: audit and flags
delete from public.date_rounds where user_a::text like '000000d0-%';
select pg_temp.dated('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a2', 4);
select pg_temp.dated('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a3', 6);
select pg_temp.dated('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a1', 8);
select pg_temp.dated('000000d0-0000-4000-8000-000000000001', '000000d0-0000-4000-8000-0000000000a1', 12);
set local role authenticated;
select pg_temp.act('000000d0-0000-4000-8000-0000000000a1');
select public.answer_date('000000d0-0000-4000-8000-000000000001', true);
select pg_temp.act('000000d0-0000-4000-8000-000000000001');
select is(public.answer_date('000000d0-0000-4000-8000-0000000000a1', true) ->> 'state', 'confirmed',
  'a third date with the same person through the app');
reset role;
select is((select count(*)::int from public.date_review_flags f join pg_temp.rounds r on r.id = f.date_round_id
           where f.reason = 'same_pair_repeated'), 1, 'is flagged for review as a repeated pair');
select ok(exists (select 1 from public.audit_events where action = 'hot_person_on'
                  and target_id = '000000d0-0000-4000-8000-000000000001'),
  'the badge turning on is recorded');
select ok((select active from private.hot_person_state where user_id = '000000d0-0000-4000-8000-000000000001'),
  'and its state is kept for the consistency check');

-- ---------------------------------------------------------------- moderation
create temp table reported on commit drop as
  select id from public.date_rounds where user_b = '000000d0-0000-4000-8000-0000000000a2' limit 1;
grant select on reported to authenticated;
set local role authenticated;
select throws_ok($$select public.invalidate_date((select id from reported), 'test')$$,
  '42501', null, 'only moderators can invalidate a date');
select pg_temp.act('000000d0-0000-4000-8000-0000000000b1');
select is(public.invalidate_date((select id from reported), 'Reported as never met') ->> 'ok', 'true',
  'a moderator can');
select pg_temp.act('000000d0-0000-4000-8000-000000000001');
select is(public.get_my_dates() -> 'active', 'false'::jsonb, 'an invalidated date stops counting at once');
reset role;
select ok(exists (select 1 from public.audit_events where action = 'date_invalidated'), 'and the action is recorded');

-- ---------------------------------------------------------------- the scheduled consistency check
select ok(exists (select 1 from cron.job where jobname = 'soul-dates-consistency'),
  'a consistency check is scheduled');
update public.date_rounds set confirmed_at = now() - interval '31 days'
  where user_a::text like '000000d0-%' and status = 'confirmed';
insert into private.hot_person_state (user_id, active) values ('000000d0-0000-4000-8000-0000000000a3', true)
on conflict (user_id) do update set active = true;
select private.dates_consistency();
select ok(not (select active from private.hot_person_state where user_id = '000000d0-0000-4000-8000-0000000000a3'),
  'it records a badge that lapsed when its dates aged out');

select * from finish();
rollback;
