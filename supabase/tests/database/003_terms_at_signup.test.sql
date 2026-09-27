-- Rules ticked before sign-in are recorded at account creation (current version only).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(4);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000d1', 'test.user.11@srmist.edu.in', 'authenticated', 'authenticated',
   jsonb_build_object('accepted_terms_version',
     (select value ->> 'version' from public.app_config where key = 'current_terms_version'))),
  ('00000000-0000-4000-8000-0000000000d2', 'test.user.12@srmist.edu.in', 'authenticated', 'authenticated',
   '{"accepted_terms_version": "some-old-version"}'),
  ('00000000-0000-4000-8000-0000000000d3', 'test.user.13@srmist.edu.in', 'authenticated', 'authenticated', '{}');

select is((select terms_version from public.account_private where id = '00000000-0000-4000-8000-0000000000d1'),
  (select value ->> 'version' from public.app_config where key = 'current_terms_version'),
  'current rules version ticked before sign-in is recorded');
select is((select terms_version from public.account_private where id = '00000000-0000-4000-8000-0000000000d2'),
  null, 'an outdated version is not recorded');
select is((select terms_version from public.account_private where id = '00000000-0000-4000-8000-0000000000d3'),
  null, 'no ticked version leaves the terms step open');

-- The app and the server agree on the current version (src/features/auth/legal/documents.ts).
select is((select value ->> 'version' from public.app_config where key = 'current_terms_version'),
  '2026-09-27-draft-2', 'server terms version matches the app''s TERMS_VERSION');

select * from finish();
rollback;
