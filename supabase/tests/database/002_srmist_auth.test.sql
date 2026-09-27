-- SOUL spec v2 auth rules: SRMIST-only sign-up, terms, 18+ DOB, server status.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

-- ------------------------------------------------------------ domain gate (hook)
select is(public.hook_before_user_created('{"user": {"email": "test.user.01@srmist.edu.in"}}'), '{}'::jsonb,
  'SRMIST email is allowed');
select is(public.hook_before_user_created('{"user": {"email": "  Test.User.01@SRMIST.EDU.IN "}}'), '{}'::jsonb,
  'domain check is case- and whitespace-insensitive');
select is((public.hook_before_user_created('{"user": {"email": "test.user.01@gmail.com"}}') -> 'error' ->> 'http_code')::int, 403,
  'gmail is rejected');
select is((public.hook_before_user_created('{"user": {"email": "test.user.01@srmist.edu.in.example.com"}}') -> 'error' ->> 'http_code')::int, 403,
  'look-alike suffix domains are rejected');
select is((public.hook_before_user_created('{"user": {"email": "test.user.01@mail.srmist.edu.in"}}') -> 'error' ->> 'http_code')::int, 403,
  'unlisted subdomains are rejected until added to the allowlist');
select is((public.hook_before_user_created('{"user": {"email": "srmist.edu.in"}}') -> 'error' ->> 'http_code')::int, 403,
  'malformed email is rejected');
select is((public.hook_before_user_created('{"user": {}}') -> 'error' ->> 'http_code')::int, 403,
  'missing email is rejected');

update public.app_config set value = '["srmist.edu.in", "mail.srmist.edu.in"]' where key = 'allowed_email_domains';
select is(public.hook_before_user_created('{"user": {"email": "test.user.01@mail.srmist.edu.in"}}'), '{}'::jsonb,
  'domains can be added server-side without an app release');

select ok(has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'),
  'auth admin can run the hook');
select ok(not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute'),
  'app users cannot call the hook');

-- ------------------------------------------------------------ onboarding functions
insert into auth.users (id, email, aud, role, email_confirmed_at)
values ('00000000-0000-4000-8000-0000000000c1', 'test.user.01@srmist.edu.in', 'authenticated', 'authenticated', now());

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000c1", "role": "authenticated"}';

select is(public.get_my_status() -> 'steps', '{"email": true, "terms": false, "age": false, "profile": false}'::jsonb,
  'a fresh account has only the email step done');
select is(public.accept_terms('an-old-version') ->> 'reason', 'outdated_terms', 'outdated terms versions are refused');
select is(public.accept_terms((select value ->> 'version' from public.app_config where key = 'current_terms_version')) ->> 'ok',
  'true', 'the current terms version is accepted');
select is((public.get_my_status() -> 'steps' ->> 'terms')::boolean, true, 'terms step is now complete');

select is(public.set_date_of_birth((current_date - interval '17 years')::date) ->> 'reason', 'underage',
  'under-18 date of birth is refused');
reset role;
select is((select date_of_birth from public.account_private where id = '00000000-0000-4000-8000-0000000000c1'), null,
  'a minor''s date of birth is not stored');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000c1", "role": "authenticated"}';
select is(public.set_date_of_birth('2000-06-15') ->> 'reason', 'age_gate_locked',
  'after an under-18 attempt, re-entry is locked (cannot simply retry with an older date)');
select is((public.get_my_status() ->> 'age_locked')::boolean, true, 'status reports the age lock');
reset role;

-- A second, adult account.
insert into auth.users (id, email, aud, role, email_confirmed_at)
values ('00000000-0000-4000-8000-0000000000c2', 'test.user.02@srmist.edu.in', 'authenticated', 'authenticated', now());
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000c2", "role": "authenticated"}';
select is(public.set_date_of_birth('2003-04-25'), '{"ok": true, "zodiac": "taurus"}'::jsonb,
  'adult date of birth is stored and zodiac derived server-side');
select is(public.set_date_of_birth('1999-01-01') ->> 'reason', 'already_set', 'date of birth cannot be changed by the user');
select is(public.get_my_status() ->> 'eligibility', 'incomplete', 'still not eligible without terms and profile');
reset role;
select set_config('request.jwt.claims', '', true);

select is(public.get_my_status(), null, 'no status without a signed-in user');

select * from finish();
rollback;
