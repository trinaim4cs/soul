-- Phase 6 discovery rules (DECISIONS D-042). Neutral identities only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(38);

-- Test-local helper: an account past every onboarding step, with one main photo.
create function pg_temp.mk(
  p_id uuid, p_gender public.gender, p_show public.gender[], p_dob date,
  p_privacy public.privacy_mode default 'normal', p_complete boolean default true,
  p_photo public.photo_status default 'approved', p_min smallint default 18,
  p_max smallint default 30, p_zodiac_visible boolean default false,
  p_completed_at timestamptz default now() - interval '30 days'
) returns void language plpgsql as $$
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (p_id, 'test.user.' || right(p_id::text, 12) || '@srmist.edu.in', 'authenticated', 'authenticated', now());
  update public.account_private
    set terms_version = (select value ->> 'version' from public.app_config where key = 'current_terms_version'),
        terms_accepted_at = now(),
        date_of_birth = p_dob,
        profile_completed_at = case when p_complete then p_completed_at end
    where id = p_id;
  update public.profiles
    set display_name = 'Test User', hook = 'Hook', gender = p_gender,
        privacy_mode = p_privacy, zodiac_visible = p_zodiac_visible
    where id = p_id;
  update public.preferences set show_me = p_show, min_age = p_min, max_age = p_max where user_id = p_id;
  if p_photo is not null then
    insert into public.profile_photos (id, user_id, storage_path, blurred_path, position, status, source, width, height)
    values (p_id, p_id, p_id || '/' || p_id || '.jpg', p_id || '/' || p_id || '.jpg', 0, p_photo, 'camera', 1080, 1350);
  end if;
end $$;

-- Ages relative to today so the suite never ages out.
select pg_temp.mk('0000000f-0000-4000-8000-000000000001', 'woman', '{man}', (current_date - interval '22 years 10 days')::date);          -- V viewer
select pg_temp.mk('0000000f-0000-4000-8000-00000000000a', 'man', '{woman}', (current_date - interval '23 years')::date);                 -- A visible
select pg_temp.mk('0000000f-0000-4000-8000-00000000000b', 'man', '{man}', (current_date - interval '23 years')::date);                   -- B wants men
select pg_temp.mk('0000000f-0000-4000-8000-00000000000c', 'woman', '{woman}', (current_date - interval '23 years')::date);               -- C wrong gender
select pg_temp.mk('0000000f-0000-4000-8000-00000000000d', 'man', '{woman}', (current_date - interval '23 years')::date);                 -- D blocked by V
select pg_temp.mk('0000000f-0000-4000-8000-00000000000e', 'man', '{woman}', (current_date - interval '23 years')::date);                 -- E blocked V
select pg_temp.mk('0000000f-0000-4000-8000-0000000000f1', 'man', '{woman}', (current_date - interval '23 years')::date, 'private');      -- F private
select pg_temp.mk('0000000f-0000-4000-8000-0000000000f2', 'man', '{woman}', (current_date - interval '23 years')::date, 'private');      -- G private, liked V
select pg_temp.mk('0000000f-0000-4000-8000-0000000000f3', 'man', '{woman}', (current_date - interval '23 years')::date, 'anonymous');    -- H anonymous
select pg_temp.mk('0000000f-0000-4000-8000-0000000000f4', 'man', '{woman}', (current_date - interval '23 years')::date, 'normal', false); -- I incomplete
select pg_temp.mk('0000000f-0000-4000-8000-0000000000f5', 'man', '{woman}', (current_date - interval '35 years')::date, 'normal', true, 'approved', 18::smallint, 40::smallint); -- J age 35
select pg_temp.mk('0000000f-0000-4000-8000-0000000000f6', 'man', '{woman}', (current_date - interval '26 years')::date, 'normal', true, 'approved', 25::smallint, 30::smallint); -- K wants 25+
select pg_temp.mk('0000000f-0000-4000-8000-0000000000f7', 'man', '{woman}', make_date(extract(year from current_date)::int - 24, 8, 1), 'normal', true, 'approved', 18::smallint, 30::smallint, true);  -- L leo shown
select pg_temp.mk('0000000f-0000-4000-8000-0000000000f8', 'man', '{woman}', make_date(extract(year from current_date)::int - 24, 8, 1), 'normal', true, 'approved', 18::smallint, 30::smallint, false); -- M leo hidden
select pg_temp.mk('0000000f-0000-4000-8000-0000000000f9', 'man', '{woman}', (current_date - interval '23 years')::date, 'normal', true, 'pending');  -- N photo pending
select pg_temp.mk('0000000f-0000-4000-8000-0000000000fa', 'man', '{woman}', (current_date - interval '23 years')::date, 'normal', true, 'approved', 18::smallint, 30::smallint, false, now()); -- P new

insert into public.blocks (blocker_id, blocked_id) values
  ('0000000f-0000-4000-8000-000000000001', '0000000f-0000-4000-8000-00000000000d'),
  ('0000000f-0000-4000-8000-00000000000e', '0000000f-0000-4000-8000-000000000001');
insert into public.likes (liker_id, target_id, idempotency_key) values
  ('0000000f-0000-4000-8000-0000000000f2', '0000000f-0000-4000-8000-000000000001', gen_random_uuid());

-- Storage objects for the policy checks.
insert into storage.objects (bucket_id, name, owner)
select b, u || '/' || u || '.jpg', u::uuid
from unnest(array['0000000f-0000-4000-8000-00000000000a', '0000000f-0000-4000-8000-0000000000f3',
                  '0000000f-0000-4000-8000-0000000000f9', '0000000f-0000-4000-8000-00000000000b']) as u
cross join unnest(array['profile-photos', 'profile-photos-blurred']) as b;

select ok(private.is_eligible('0000000f-0000-4000-8000-000000000001'), 'a complete account is eligible');
select ok(not private.is_eligible('0000000f-0000-4000-8000-0000000000f4'), 'an incomplete profile is not eligible');

-- ------------------------------------------------------------------ as the viewer
set local role authenticated;
set local request.jwt.claims = '{"sub": "0000000f-0000-4000-8000-000000000001", "role": "authenticated"}';

select is(public.get_my_status() ->> 'eligibility', 'eligible', 'get_my_status agrees with is_eligible');
select is(public.discovery_feed() ->> 'ok', 'true', 'an eligible viewer gets a feed');

-- Only this file's fixtures are compared, so local seed data (scripts/seed-local-discovery.py)
-- cannot change the result.
create temp table feed_ids on commit drop as
  select (c.card ->> 'id')::uuid as id, c.n
  from jsonb_array_elements(public.discovery_feed(p_limit => 50) -> 'cards') with ordinality as c(card, n)
  where c.card ->> 'id' like '0000000f-%';

select set_eq('select id from feed_ids', $$values
  ('0000000f-0000-4000-8000-00000000000a'::uuid), ('0000000f-0000-4000-8000-0000000000f2'),
  ('0000000f-0000-4000-8000-0000000000f3'), ('0000000f-0000-4000-8000-0000000000f7'),
  ('0000000f-0000-4000-8000-0000000000f8'), ('0000000f-0000-4000-8000-0000000000fa')$$,
  'the feed holds exactly the compatible, visible, unblocked candidates');
select is((select id from feed_ids order by n limit 1), '0000000f-0000-4000-8000-0000000000fa'::uuid,
  'new profiles come first');

select is((select c from jsonb_array_elements(public.discovery_feed() -> 'cards') c
           where c ->> 'id' = '0000000f-0000-4000-8000-0000000000f3') ->> 'name', null,
  'anonymous cards carry no name');
select is((select c -> 'photos' -> 0 ->> 'bucket' from jsonb_array_elements(public.discovery_feed() -> 'cards') c
           where c ->> 'id' = '0000000f-0000-4000-8000-0000000000f3'), 'profile-photos-blurred',
  'anonymous cards point only at blurred copies');
select is((select c ->> 'zodiac' from jsonb_array_elements(public.discovery_feed() -> 'cards') c
           where c ->> 'id' = '0000000f-0000-4000-8000-0000000000f7'), 'leo', 'a shown zodiac is included');
select is((select c ->> 'zodiac' from jsonb_array_elements(public.discovery_feed() -> 'cards') c
           where c ->> 'id' = '0000000f-0000-4000-8000-0000000000f8'), null, 'a hidden zodiac is not');
select ok((select not (c ? 'email' or c ? 'date_of_birth' or c ? 'show_me' or c ? 'privacy_mode')
           from jsonb_array_elements(public.discovery_feed() -> 'cards') c
           where c ->> 'id' = '0000000f-0000-4000-8000-00000000000a'), 'cards expose no private fields');

select is(public.get_profile_card('0000000f-0000-4000-8000-0000000000f5') ->> 'ok', 'true',
  'a profile outside the viewer''s own age filter can still be opened');
select is(public.get_profile_card('0000000f-0000-4000-8000-0000000000f6') ->> 'reason', 'not_available',
  'the candidate''s own age range is respected');
select is(public.get_profile_card('0000000f-0000-4000-8000-0000000000f1') ->> 'reason', 'not_available',
  'private profiles are hidden from people they have not liked');
select is(public.get_profile_card('0000000f-0000-4000-8000-00000000000b') ->> 'reason', 'not_available',
  'gender compatibility applies both ways');
select is(public.get_profile_card('0000000f-0000-4000-8000-00000000000d') ->> 'reason', 'not_available',
  'people the viewer blocked are hidden');
select is(public.get_profile_card('0000000f-0000-4000-8000-00000000000e') ->> 'reason', 'not_available',
  'people who blocked the viewer are hidden');
select is(public.get_profile_card('0000000f-0000-4000-8000-0000000000f9') ->> 'reason', 'not_available',
  'profiles whose main photo is not approved are hidden');

select is(public.swipe_right('0000000f-0000-4000-8000-00000000000b', gen_random_uuid()) ->> 'reason', 'not_available',
  'a like on someone the viewer cannot see is refused');
select is(public.swipe_right('0000000f-0000-4000-8000-00000000000a', '0000000f-0000-4000-8000-00000000aaaa') ->> 'replayed',
  'false', 'a like is recorded');
select is(public.swipe_right('0000000f-0000-4000-8000-00000000000a', '0000000f-0000-4000-8000-00000000aaaa') ->> 'replayed',
  'true', 'a replayed like returns the first result');
select is((select count(*)::int from public.likes), 1, 'the viewer reads only their own likes, once');
select throws_ok(
  $$insert into public.likes (liker_id, target_id, idempotency_key)
    values ('0000000f-0000-4000-8000-000000000001', '0000000f-0000-4000-8000-0000000000f7', gen_random_uuid())$$,
  '42501', null, 'likes cannot be written directly');
select ok(not (public.discovery_feed() -> 'cards') @> '[{"id": "0000000f-0000-4000-8000-00000000000a"}]',
  'liked profiles leave the feed');

select is(public.swipe_left('0000000f-0000-4000-8000-0000000000f7') ->> 'ok', 'true', 'a pass is recorded');
select ok(not (public.discovery_feed() -> 'cards') @> '[{"id": "0000000f-0000-4000-8000-0000000000f7"}]',
  'passed profiles leave the feed');
select ok(not (public.discovery_feed(array['0000000f-0000-4000-8000-0000000000fa']::uuid[]) -> 'cards')
            @> '[{"id": "0000000f-0000-4000-8000-0000000000fa"}]', 'cards already on screen are excluded');

-- Storage: signed URLs are only issued for objects the viewer may read.
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos'
           and name like '0000000f-0000-4000-8000-00000000000a/%'), 1, 'a visible profile''s photo is readable');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos'
           and name like '0000000f-0000-4000-8000-0000000000f3/%'), 0, 'an anonymous profile''s original photo is not');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos-blurred'
           and name like '0000000f-0000-4000-8000-0000000000f3/%'), 1, 'its blurred copy is');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos'
           and name like '0000000f-0000-4000-8000-0000000000f9/%'), 0, 'photos awaiting review are not readable');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos'
           and name like '0000000f-0000-4000-8000-00000000000b/%'), 0, 'hidden profiles'' photos are not readable');

-- ------------------------------------------------------------------ zodiac filter and pass cooldown
update public.preferences set zodiac_filter = '{leo}' where user_id = '0000000f-0000-4000-8000-000000000001';
reset role;
update public.passes set passed_at = now() - interval '31 days'
  where passer_id = '0000000f-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub": "0000000f-0000-4000-8000-000000000001", "role": "authenticated"}';

select ok((public.discovery_feed() -> 'cards') @> '[{"id": "0000000f-0000-4000-8000-0000000000f7"}]',
  'a passed profile returns after the cooldown, and a shown leo matches the zodiac filter');
select ok(not (public.discovery_feed() -> 'cards') @> '[{"id": "0000000f-0000-4000-8000-0000000000f8"}]',
  'a hidden zodiac never matches a zodiac filter (no inference)');
select is(jsonb_array_length(public.discovery_feed() -> 'cards'), 1, 'only zodiac matches remain');

-- ------------------------------------------------------------------ ineligible viewer and anon
set local request.jwt.claims = '{"sub": "0000000f-0000-4000-8000-0000000000f4", "role": "authenticated"}';
select is(public.discovery_feed() ->> 'reason', 'not_eligible', 'an ineligible account gets no feed');
select is(public.swipe_right('0000000f-0000-4000-8000-00000000000a', gen_random_uuid()) ->> 'reason',
  'not_available', 'an ineligible account cannot like');

reset role;
set local role anon;
select throws_ok('select public.discovery_feed()', '42501', null, 'anon cannot call the feed');

select * from finish();
rollback;
