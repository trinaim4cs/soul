-- Phase 20: the Android release the app compares itself with (DECISIONS D-039, D-058).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(6);

select is((select client_visible from public.app_config where key = 'android_release'), true,
  'the release row exists and is meant for the app');
select ok((select value ?& array['latest_version', 'latest_version_code', 'min_version_code', 'apk_url', 'sha256']
           from public.app_config where key = 'android_release'),
  'it carries every field the app reads');

insert into auth.users (id, email, aud, role, email_confirmed_at)
values ('00000190-0000-4000-8000-000000000001', 'test.user.000000000001@srmist.edu.in',
        'authenticated', 'authenticated', now());

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000190-0000-4000-8000-000000000001", "role": "authenticated"}';
select isnt((select value from public.app_config where key = 'android_release'), null,
  'a signed-in person can read it');
select is((select count(*)::int from public.app_config where key = 'allowed_email_domains'), 0,
  'but still no server-only setting');
select throws_ok($$update public.app_config set value = '{}' where key = 'android_release'$$,
  '42501', null, 'and nobody can change it from the app');
reset role;

set local role anon;
select throws_ok($$select value from public.app_config where key = 'android_release'$$,
  '42501', null, 'signed out, nothing is readable');
reset role;

select * from finish();
rollback;
