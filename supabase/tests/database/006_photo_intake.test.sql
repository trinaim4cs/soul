-- Photo intake (DECISIONS D-043): the app writes only into its private inbox; published
-- photos are written and deleted by the server. Neutral identities only (User A, User B).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(15);

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000f1', 'user.a.intake@srmist.edu.in', 'authenticated', 'authenticated', now()),
  ('00000000-0000-4000-8000-0000000000f2', 'user.b.intake@srmist.edu.in', 'authenticated', 'authenticated', now());
-- A published photo of User A, as the Edge Function would have written it.
insert into storage.objects (bucket_id, name) values
  ('profile-photos', '00000000-0000-4000-8000-0000000000f1/20000000-0000-4000-8000-000000000001.jpg');

-- ---------------------------------------------------------------- as User A
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000f1", "role": "authenticated"}';

select throws_ok(
  $$insert into storage.objects (bucket_id, name) values
    ('profile-photos', '00000000-0000-4000-8000-0000000000f1/20000000-0000-4000-8000-000000000002.jpg')$$,
  '42501', null, 'the app cannot publish a photo directly');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values
    ('profile-photos-blurred', '00000000-0000-4000-8000-0000000000f1/20000000-0000-4000-8000-000000000002.jpg')$$,
  '42501', null, 'the app cannot publish a blurred copy directly');

select lives_ok(
  $$insert into storage.objects (bucket_id, name) values
    ('photo-uploads', '00000000-0000-4000-8000-0000000000f1/20000000-0000-4000-8000-000000000002.jpg')$$,
  'the app uploads a photo into its own inbox');
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values
    ('photo-uploads', '00000000-0000-4000-8000-0000000000f1/20000000-0000-4000-8000-000000000002.tiny.jpg')$$,
  'the app uploads the tiny copy into its own inbox');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values
    ('photo-uploads', '00000000-0000-4000-8000-0000000000f2/20000000-0000-4000-8000-000000000003.jpg')$$,
  '42501', null, 'nobody uploads into another student''s inbox');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values
    ('photo-uploads', '00000000-0000-4000-8000-0000000000f1/notes.txt')$$,
  '42501', null, 'the inbox takes only photo file names');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values
    ('photo-uploads', '00000000-0000-4000-8000-0000000000f1/x/20000000-0000-4000-8000-000000000003.jpg')$$,
  '42501', null, 'the inbox has no sub-folders');

select lives_ok(
  $$insert into storage.objects (bucket_id, name) values
    ('photo-uploads', '00000000-0000-4000-8000-0000000000f1/20000000-0000-4000-8000-000000000004.jpg'),
    ('photo-uploads', '00000000-0000-4000-8000-0000000000f1/20000000-0000-4000-8000-000000000004.tiny.jpg')$$,
  'a second photo can be in flight');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values
    ('photo-uploads', '00000000-0000-4000-8000-0000000000f1/20000000-0000-4000-8000-000000000005.jpg')$$,
  '42501', null, 'the inbox is capped, so an account cannot park files there');

-- ---------------------------------------------------------------- as User B
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000f2", "role": "authenticated"}';
select is((select count(*)::int from storage.objects where bucket_id = 'photo-uploads'), 0,
  'another student cannot see User A''s inbox');

-- ---------------------------------------------------------------- deletes, as User A
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000f1", "role": "authenticated"}';
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'profile-photos';
delete from storage.objects where bucket_id = 'photo-uploads';
reset role;
select is((select count(*)::int from storage.objects
           where name = '00000000-0000-4000-8000-0000000000f1/20000000-0000-4000-8000-000000000001.jpg'),
  1, 'the app cannot delete or swap a published photo');
select is((select count(*)::int from storage.objects
           where bucket_id = 'photo-uploads' and name like '00000000-0000-4000-8000-0000000000f1/%'),
  0, 'the app can clear its own inbox');

-- ---------------------------------------------------------------- signed out
set local role anon;
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values
    ('photo-uploads', '00000000-0000-4000-8000-0000000000f1/20000000-0000-4000-8000-000000000006.jpg')$$,
  '42501', null, 'signed-out requests cannot upload');
reset role;

select is((select row(public, allowed_mime_types, file_size_limit)::text from storage.buckets where id = 'photo-uploads'),
  row(false, array['image/jpeg'], 3145728::bigint)::text, 'the inbox is private, JPEG only, 3 MB at most');
select is((select allowed_mime_types from storage.buckets where id = 'profile-photos'),
  array['image/jpeg'], 'published photos are JPEG only');

select * from finish();
rollback;
