-- Phase 5 profile rules (DECISIONS D-041). Neutral identities only (User A, User B).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(31);

-- Fixtures, created as the database owner: two accounts past the email, terms and age steps.
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000e1', 'user.a.profile@srmist.edu.in', 'authenticated', 'authenticated', now()),
  ('00000000-0000-4000-8000-0000000000e2', 'user.b.profile@srmist.edu.in', 'authenticated', 'authenticated', now());
update public.account_private
  set terms_version = (select value ->> 'version' from public.app_config where key = 'current_terms_version'),
      terms_accepted_at = now(),
      date_of_birth = date '2004-06-15'
  where id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2');

select is((select count(*)::int from public.preferences
           where user_id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2')),
  2, 'new accounts get a preferences row');

-- Uploaded objects for User A (two photos) and one for User B, as storage would record them.
insert into storage.objects (bucket_id, name, owner) values
  ('profile-photos', '00000000-0000-4000-8000-0000000000e1/10000000-0000-4000-8000-000000000001.jpg', '00000000-0000-4000-8000-0000000000e1'),
  ('profile-photos-blurred', '00000000-0000-4000-8000-0000000000e1/10000000-0000-4000-8000-000000000001.jpg', '00000000-0000-4000-8000-0000000000e1'),
  ('profile-photos', '00000000-0000-4000-8000-0000000000e1/10000000-0000-4000-8000-000000000002.jpg', '00000000-0000-4000-8000-0000000000e1'),
  ('profile-photos-blurred', '00000000-0000-4000-8000-0000000000e1/10000000-0000-4000-8000-000000000002.jpg', '00000000-0000-4000-8000-0000000000e1'),
  ('profile-photos', '00000000-0000-4000-8000-0000000000e1/10000000-0000-4000-8000-000000000003.jpg', '00000000-0000-4000-8000-0000000000e1'),
  ('profile-photos-blurred', '00000000-0000-4000-8000-0000000000e1/10000000-0000-4000-8000-000000000003.jpg', '00000000-0000-4000-8000-0000000000e1');

-- ---------------------------------------------------------------- as User A
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}';

select is(public.submit_profile() -> 'missing', '["photo", "name", "gender", "show_me", "hook"]'::jsonb,
  'an empty profile reports every missing field');

select throws_ok(
  $$insert into public.profile_photos (id, user_id, storage_path, blurred_path, position, status, source, width, height)
    values ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-0000000000e1',
            'x', 'x', 0, 'approved', 'camera', 800, 1000)$$,
  '42501', null, 'photos cannot be inserted directly (no self-approval)');

select throws_ok(
  $$select public.add_profile_photo('00000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000001', 1080, 1350, 'camera')$$,
  '42501', null, 'the app cannot register photos itself (only the photo Edge Function can)');
select throws_ok(
  $$select public.remove_profile_photo('00000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'the app cannot remove photo rows itself');

-- ---------------------------------------------------------------- as the photo Edge Function
set local role service_role;
select is(public.add_profile_photo('00000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000099', 1080, 1350, 'camera') ->> 'reason',
  'upload_missing', 'a photo without an uploaded object is refused');
select is(public.add_profile_photo('00000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000001', 50, 50, 'camera') ->> 'reason',
  'invalid_size', 'tiny images are refused');
select is(public.add_profile_photo('00000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000001', 1080, 1350, 'screen') ->> 'reason',
  'invalid', 'unknown sources are refused');

select is(public.add_profile_photo('00000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000001', 1080, 1350, 'camera') ->> 'status',
  'approved', 'with review off, a registered photo is approved');
select is(public.add_profile_photo('00000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000002', 1080, 1350, 'library') ->> 'position',
  '1', 'the second photo takes the next position');
select is(public.add_profile_photo('00000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000002', 1080, 1350, 'library') ->> 'reason',
  'duplicate', 'a photo registers only once');

set local role authenticated;

select throws_ok(
  $$update public.profile_photos set status = 'approved'$$,
  '42501', null, 'photo status cannot be changed by the owner');

update public.profiles set display_name = 'User A', hook = 'Late chai, early runs', gender = 'woman'
  where id = '00000000-0000-4000-8000-0000000000e1';
update public.preferences set show_me = '{man,non_binary}'
  where user_id = '00000000-0000-4000-8000-0000000000e1';

select throws_ok(
  $$update public.preferences set min_age = 16 where user_id = '00000000-0000-4000-8000-0000000000e1'$$,
  '23514', null, 'age filters below 18 are refused');
select throws_ok(
  $$update public.profiles set hook = 'This hook is far longer than thirty characters' where id = '00000000-0000-4000-8000-0000000000e1'$$,
  '23514', null, 'hooks longer than 30 characters are refused');

select is(public.submit_profile() ->> 'ok', 'true', 'a complete profile is accepted');
select is((public.get_my_status() -> 'steps' ->> 'profile')::boolean, true, 'the profile step is complete');
select is(public.get_my_status() ->> 'eligibility', 'eligible', 'the account is now eligible');

select is(public.reorder_profile_photos(array['10000000-0000-4000-8000-000000000001']::uuid[]) ->> 'reason',
  'invalid_order', 'a reorder must list every photo exactly once');
select is(public.reorder_profile_photos(array['10000000-0000-4000-8000-000000000002',
                                             '10000000-0000-4000-8000-000000000001']::uuid[]) ->> 'ok',
  'true', 'photos can be reordered');
select is((select id::text from public.profile_photos
           where user_id = '00000000-0000-4000-8000-0000000000e1' and position = 0),
  '10000000-0000-4000-8000-000000000002', 'the first id becomes the primary photo');

set local role service_role;
select is(public.remove_profile_photo('00000000-0000-4000-8000-0000000000e2', '10000000-0000-4000-8000-000000000002') ->> 'reason', 'not_found',
  'a photo is removed only for its owner');
select is(public.remove_profile_photo('00000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000002') ->> 'ok', 'true',
  'a photo can be removed while another remains');
select is((select position from public.profile_photos where id = '10000000-0000-4000-8000-000000000001'),
  0::smallint, 'positions close up after a removal');
select is(public.remove_profile_photo('00000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000001') ->> 'reason', 'last_photo',
  'a completed profile keeps at least one photo');
set local role authenticated;

select is((public.get_my_profile() ->> 'age')::int,
  extract(year from age(current_date, date '2004-06-15'))::int, 'age is derived from the private date of birth');
select is(public.get_my_profile() ->> 'zodiac', 'gemini', 'zodiac is derived on the server');
select ok(not (public.get_my_profile() ? 'date_of_birth'), 'the date of birth is never returned');

-- ---------------------------------------------------------------- as User B
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e2", "role": "authenticated"}';

select is((select count(*)::int from public.profile_photos), 0, 'another account cannot read User A''s photos');
set local role service_role;
select is(public.add_profile_photo('00000000-0000-4000-8000-0000000000e2', '10000000-0000-4000-8000-000000000003', 1080, 1350, 'camera') ->> 'reason',
  'upload_missing', 'a photo is registered only from its owner''s own folder');
set local role authenticated;
update public.preferences set show_me = '{woman}' where user_id = '00000000-0000-4000-8000-0000000000e1';
reset role;
select is((select show_me from public.preferences where user_id = '00000000-0000-4000-8000-0000000000e1'),
  '{man,non_binary}'::public.gender[], 'User B cannot change User A''s preferences');

-- ---------------------------------------------------------------- review switched on
update public.app_config set value = 'true' where key = 'photo_review_required';
set local role service_role;
select is(public.add_profile_photo('00000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000003', 1080, 1350, 'library') ->> 'status',
  'pending', 'with review on, new photos wait for a moderator');

select * from finish();
rollback;
