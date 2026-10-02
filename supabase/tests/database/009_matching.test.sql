-- Phase 8: matching (DECISIONS D-015, D-016, D-048). Neutral identities only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(46);

-- Test-local helper: an eligible account with one approved main photo and spare credits.
create function pg_temp.mk(
  p_id uuid, p_gender public.gender, p_show public.gender[],
  p_privacy public.privacy_mode default 'normal', p_reveal boolean default true
) returns void language plpgsql as $$
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (p_id, 'test.user.' || right(p_id::text, 12) || '@srmist.edu.in', 'authenticated', 'authenticated', now());
  update public.account_private
    set terms_version = (select value ->> 'version' from public.app_config where key = 'current_terms_version'),
        terms_accepted_at = now(),
        date_of_birth = (current_date - interval '22 years 10 days')::date,
        profile_completed_at = now() - interval '30 days'
    where id = p_id;
  update public.profiles
    set display_name = 'Test User', hook = 'Hook', gender = p_gender,
        privacy_mode = p_privacy, reveal_on_match = p_reveal
    where id = p_id;
  update public.preferences set show_me = p_show where user_id = p_id;
  insert into public.profile_photos (id, user_id, storage_path, blurred_path, position, status, source, width, height)
  values (p_id, p_id, p_id || '/' || p_id || '.jpg', p_id || '/' || p_id || '.jpg', 0, 'approved', 'camera', 1080, 1350);
  insert into public.swipe_credit_ledger (user_id, entry, bucket, delta, valid_from, idempotency_key)
  values (p_id, 'grant', 'topup', 20, now(), 'fixture:' || p_id);
end $$;

-- Only this file's fixtures are counted, so local test data cannot change the result.
create view pg_temp.fixture_matches as
  select * from public.matches where user_a::text like '00000080-%' and user_b::text like '00000080-%';

select pg_temp.mk('00000080-0000-4000-8000-000000000001', 'woman', '{man}');                      -- V
select pg_temp.mk('00000080-0000-4000-8000-0000000000a1', 'man', '{woman}');                      -- M1
select pg_temp.mk('00000080-0000-4000-8000-0000000000a2', 'man', '{woman}');                      -- M2
select pg_temp.mk('00000080-0000-4000-8000-0000000000a3', 'man', '{woman}');                      -- M3 (blocked later)
select pg_temp.mk('00000080-0000-4000-8000-0000000000a4', 'man', '{woman}');                      -- M4 (suspended later)
select pg_temp.mk('00000080-0000-4000-8000-0000000000b1', 'man', '{woman}', 'anonymous', true);   -- N anonymous, reveals
select pg_temp.mk('00000080-0000-4000-8000-0000000000b2', 'man', '{woman}', 'anonymous', false);  -- O anonymous, stays hidden

-- ---------------------------------------------------------------- one-sided like: no match
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(public.swipe_right('00000080-0000-4000-8000-000000000001', '30000080-0000-4000-8000-000000000001')
          -> 'match', 'null'::jsonb, 'a one-sided like is not a match');
select is(public.swipe_right('00000080-0000-4000-8000-0000000000a1', '30000080-0000-4000-8000-0000000000ff')
          ->> 'reason', 'invalid', 'nobody can like themselves');
select throws_ok($$select count(*) from public.matches$$, '42501', null, 'the app cannot read matches directly');
select throws_ok(
  $$insert into public.matches (user_a, user_b)
    values ('00000080-0000-4000-8000-000000000001', '00000080-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'the app cannot create a match itself');
reset role;
select is((select count(*)::int from pg_temp.fixture_matches), 0, 'no match exists yet');

-- ---------------------------------------------------------------- the second like makes the match
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(public.swipe_right('00000080-0000-4000-8000-0000000000a1', '30000080-0000-4000-8000-000000000002')
          -> 'match' -> 'person' ->> 'id', '00000080-0000-4000-8000-0000000000a1',
  'liking someone who liked you creates the match and returns them');
select is(public.swipe_right('00000080-0000-4000-8000-0000000000a1', '30000080-0000-4000-8000-000000000002')
          -> 'match' ->> 'id',
  (select public.get_my_matches() -> 'matches' -> 0 ->> 'id'),
  'a replay returns the same unseen match');
select is(public.get_my_swipes() -> 'balance', '23'::jsonb, 'the matching like cost one swipe, once');
reset role;
select is((select count(*)::int from pg_temp.fixture_matches), 1, 'exactly one match row exists for the pair');
select ok((select user_a < user_b and active from pg_temp.fixture_matches), 'the pair is stored in order and active');

-- ---------------------------------------------------------------- list, seen, one match
set local role authenticated;
select is(jsonb_array_length(public.get_my_matches() -> 'matches'), 1, 'the match is in the viewer''s list');
select is(public.get_my_matches() -> 'matches' -> 0 -> 'seen', 'false'::jsonb, 'a new match is unseen');
select ok(not (public.get_my_matches() -> 'matches' -> 0 -> 'person' ? 'email'), 'match cards expose no private fields');
select is(public.mark_match_seen((public.get_my_matches() -> 'matches' -> 0 ->> 'id')::uuid) ->> 'ok', 'true',
  'the viewer marks the match as seen');
select is(public.get_my_matches() -> 'matches' -> 0 -> 'seen', 'true'::jsonb, 'it stays seen');
select is(public.swipe_right('00000080-0000-4000-8000-0000000000a1', '30000080-0000-4000-8000-000000000002')
          -> 'match', 'null'::jsonb, 'a seen match is not announced again');

set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(public.get_my_matches() -> 'matches' -> 0 -> 'seen', 'false'::jsonb,
  'the other person has their own unseen state');
select is(public.get_match((public.get_my_matches() -> 'matches' -> 0 ->> 'id')::uuid) -> 'match' -> 'person' ->> 'id',
  '00000080-0000-4000-8000-000000000001', 'either person can open the match');

-- ---------------------------------------------------------------- outsiders
set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-0000000000a2", "role": "authenticated"}';
reset role;
create temp table the_match on commit drop as select id from pg_temp.fixture_matches limit 1;
grant select on the_match to authenticated;
set local role authenticated;
select is(public.get_match((select id from the_match)) ->> 'reason', 'not_available',
  'someone outside the match cannot open it');
select is(public.unmatch((select id from the_match)) ->> 'reason', 'not_found',
  'someone outside the match cannot end it');
select is(public.mark_match_seen((select id from the_match)) ->> 'ok', 'false',
  'someone outside the match cannot mark it');
select is(jsonb_array_length(public.get_my_matches() -> 'matches'), 0, 'their own list is empty');

-- ---------------------------------------------------------------- a match outlives discovery filters
reset role;
update public.preferences set show_me = '{woman}' where user_id = '00000080-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-000000000001", "role": "authenticated"}';
select ok(not private.can_view_photo_object('profile-photos',
    '00000080-0000-4000-8000-0000000000a2/00000080-0000-4000-8000-0000000000a2.jpg'),
  'a stranger outside the viewer''s preferences cannot be signed');
select ok(private.can_view_photo_object('profile-photos',
    '00000080-0000-4000-8000-0000000000a1/00000080-0000-4000-8000-0000000000a1.jpg'),
  'a match''s photo can still be signed after preferences change');
select is(public.get_profile_card('00000080-0000-4000-8000-0000000000a1') ->> 'match_id',
  (select id::text from the_match), 'a match''s profile opens and reports the match');
reset role;
update public.preferences set show_me = '{man}' where user_id = '00000080-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------- anonymous mode and the reveal
set local role authenticated;
select is(public.get_profile_card('00000080-0000-4000-8000-0000000000b1') -> 'card' -> 'name', 'null'::jsonb,
  'before a match, an anonymous person has no name');
select ok(not private.can_view_photo_object('profile-photos',
    '00000080-0000-4000-8000-0000000000b1/00000080-0000-4000-8000-0000000000b1.jpg'),
  'before a match, an anonymous person''s original photo is refused');
select public.swipe_right('00000080-0000-4000-8000-0000000000b1', '30000080-0000-4000-8000-000000000003');
select public.swipe_right('00000080-0000-4000-8000-0000000000b2', '30000080-0000-4000-8000-000000000004');
set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-0000000000b1", "role": "authenticated"}';
select public.swipe_right('00000080-0000-4000-8000-000000000001', '30000080-0000-4000-8000-000000000005');
set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-0000000000b2", "role": "authenticated"}';
select public.swipe_right('00000080-0000-4000-8000-000000000001', '30000080-0000-4000-8000-000000000006');

set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(public.get_profile_card('00000080-0000-4000-8000-0000000000b1') -> 'card' ->> 'name', 'Test User',
  'after a match, an anonymous person who allows it shows their name');
select is(public.get_profile_card('00000080-0000-4000-8000-0000000000b1') -> 'card' -> 'photos' -> 0 ->> 'bucket',
  'profile-photos', 'and their original photos');
select ok(private.can_view_photo_object('profile-photos',
    '00000080-0000-4000-8000-0000000000b1/00000080-0000-4000-8000-0000000000b1.jpg'),
  'Storage signs the revealed original for the match');
select is(public.get_profile_card('00000080-0000-4000-8000-0000000000b2') -> 'card' -> 'name', 'null'::jsonb,
  'an anonymous person who keeps the reveal off stays unnamed for a match');
select is(public.get_profile_card('00000080-0000-4000-8000-0000000000b2') -> 'card' -> 'photos' -> 0 ->> 'bucket',
  'profile-photos-blurred', 'and stays blurred');
select ok(not private.can_view_photo_object('profile-photos',
    '00000080-0000-4000-8000-0000000000b2/00000080-0000-4000-8000-0000000000b2.jpg')
  and private.can_view_photo_object('profile-photos-blurred',
    '00000080-0000-4000-8000-0000000000b2/00000080-0000-4000-8000-0000000000b2.jpg'),
  'Storage refuses their original and signs only the blurred copy');
select is(jsonb_array_length(public.get_my_matches() -> 'matches'), 3, 'the viewer now has three matches');

-- ---------------------------------------------------------------- blocked and suspended matches disappear
select public.swipe_right('00000080-0000-4000-8000-0000000000a3', '30000080-0000-4000-8000-000000000007');
select public.swipe_right('00000080-0000-4000-8000-0000000000a4', '30000080-0000-4000-8000-000000000008');
set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select public.swipe_right('00000080-0000-4000-8000-000000000001', '30000080-0000-4000-8000-000000000009');
set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select public.swipe_right('00000080-0000-4000-8000-000000000001', '30000080-0000-4000-8000-00000000000a');
reset role;
select is((select count(*)::int from pg_temp.fixture_matches where active), 5, 'five matches exist');
insert into public.blocks (blocker_id, blocked_id)
values ('00000080-0000-4000-8000-000000000001', '00000080-0000-4000-8000-0000000000a3');
update public.account_private set account_state = 'suspended' where id = '00000080-0000-4000-8000-0000000000a4';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(jsonb_array_length(public.get_my_matches() -> 'matches'), 3,
  'a blocked match and a suspended match leave the list');
set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(jsonb_array_length(public.get_my_matches() -> 'matches'), 0,
  'the blocked person no longer sees the match either');

-- ---------------------------------------------------------------- unmatch
set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(public.unmatch((select id from the_match)) ->> 'ok', 'true', 'either person can unmatch');
select is(public.unmatch((select id from the_match)) ->> 'ok', 'true', 'unmatching twice is harmless');
select is(jsonb_array_length(public.get_my_matches() -> 'matches'), 2, 'the match leaves the list');
select is(public.get_profile_card('00000080-0000-4000-8000-0000000000a1') ->> 'reason', 'not_available',
  'after unmatching, the profile cannot be opened again');
select ok(not private.can_view_photo_object('profile-photos',
    '00000080-0000-4000-8000-0000000000a1/00000080-0000-4000-8000-0000000000a1.jpg'),
  'and their photos can no longer be signed');
set local request.jwt.claims = '{"sub": "00000080-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(jsonb_array_length(public.get_my_matches() -> 'matches'), 0, 'it leaves the other person''s list too');
select is(public.swipe_right('00000080-0000-4000-8000-000000000001', '30000080-0000-4000-8000-00000000000b')
          ->> 'reason', 'not_available', 'an unmatched pair cannot like each other again');
reset role;
select is((select (active, ended_by)::text from public.matches where id = (select id from the_match)),
  '(f,00000080-0000-4000-8000-000000000001)', 'the row is kept, inactive, with who ended it');
select is((select count(*)::int from public.matches
           where user_a = '00000080-0000-4000-8000-000000000001' and user_b = '00000080-0000-4000-8000-0000000000a1'),
  1, 'there is still exactly one row for the pair');

select * from finish();
rollback;
