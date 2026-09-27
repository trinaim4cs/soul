-- Email + code is the only way in, and accounts stay on allowed domains (DECISIONS D-046).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);

-- ---------------------------------------------------------------- allowed-domain check
select ok(private.email_domain_allowed('user.a@srmist.edu.in'), 'an SRMIST address is allowed');
select ok(private.email_domain_allowed('  User.A@SRMIST.EDU.IN '), 'case and spaces do not matter');
select ok(not private.email_domain_allowed('user.a@srmist.edu.in.evil.com'), 'look-alike domains are refused');
select ok(not private.email_domain_allowed('user.a@gmail.com'), 'other domains are refused');
select ok(not private.email_domain_allowed('srmist.edu.in'), 'an address needs an @');
select ok(not private.email_domain_allowed(null), 'no address is refused');

-- ---------------------------------------------------------------- access token hook
select is(public.hook_custom_access_token(
    '{"user_id": "00000000-0000-4000-8000-0000000000a1", "authentication_method": "password", "claims": {"sub": "x"}}')
    -> 'error' ->> 'http_code', '403', 'no session from a password sign-in');
select is(public.hook_custom_access_token(
    '{"user_id": "00000000-0000-4000-8000-0000000000a1", "authentication_method": "otp", "claims": {"sub": "x", "role": "authenticated"}}'),
  '{"claims": {"sub": "x", "role": "authenticated"}}'::jsonb, 'a code sign-in keeps its claims unchanged');
select is(public.hook_custom_access_token(
    '{"user_id": "00000000-0000-4000-8000-0000000000a1", "authentication_method": "token_refresh", "claims": {"sub": "x"}}')
    -> 'claims' ->> 'sub', 'x', 'refreshing a code session still works');

set local role authenticated;
select throws_ok($$select public.hook_custom_access_token('{}'::jsonb)$$, '42501', null,
  'the app cannot call the token hook');
reset role;

-- ---------------------------------------------------------------- email changes
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'user.a.hardening@srmist.edu.in', 'authenticated', 'authenticated', now());

select throws_ok(
  $$update auth.users set email = 'user.a.hardening@gmail.com' where id = '00000000-0000-4000-8000-0000000000a1'$$,
  '42501', null, 'an account cannot move to a non-SRMIST email');
select throws_ok(
  $$update auth.users set email_change = 'user.a.hardening@gmail.com' where id = '00000000-0000-4000-8000-0000000000a1'$$,
  '42501', null, 'a change to a non-SRMIST email cannot even be requested');
select lives_ok(
  $$update auth.users set email_change = 'user.a.new@srmist.edu.in' where id = '00000000-0000-4000-8000-0000000000a1'$$,
  'a change to another SRMIST address can be requested (both inboxes must confirm)');
select lives_ok(
  $$update auth.users set last_sign_in_at = now() where id = '00000000-0000-4000-8000-0000000000a1'$$,
  'other account updates are unaffected');

select * from finish();
rollback;
