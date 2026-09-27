-- SOUL RLS foundation tests (spec v2). Neutral identities only (User A, User B).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

-- Fixtures: two ordinary accounts, created as the database owner.
insert into auth.users (id, email, aud, role, email_confirmed_at)
values
  ('00000000-0000-4000-8000-00000000000a', 'user.a@srmist.edu.in', 'authenticated', 'authenticated', now()),
  ('00000000-0000-4000-8000-00000000000b', 'user.b@srmist.edu.in', 'authenticated', 'authenticated', null);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)),
  0,
  'every public table has RLS enabled and forced'
);
select is((select count(*)::int from public.account_private where id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b')), 2, 'account_private provisioned for new users');
select is((select count(*)::int from public.profiles where id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b')), 2, 'profiles provisioned for new users');
select isnt(
  (select institutional_email_verified_at from public.account_private where id = '00000000-0000-4000-8000-00000000000a'),
  null,
  'confirmed email is mirrored into server-owned state'
);
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-00000000000b';
select isnt(
  (select institutional_email_verified_at from public.account_private where id = '00000000-0000-4000-8000-00000000000b'),
  null,
  'email confirmation after sign-up is mirrored'
);
select hasnt_table('public', 'approved_zones', 'no geofence tables exist (spec v2: no geofence)');

-- ---------------------------------------------------------------- anon
set local role anon;
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.account_private', '42501', null, 'anon cannot read account_private');
select throws_ok('select public.get_my_status()', '42501', null, 'anon cannot call get_my_status');
reset role;

-- ---------------------------------------------------------------- User A
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-00000000000a", "role": "authenticated"}';

select is((select count(*)::int from public.account_private), 1, 'User A sees only their own account_private row');
select is((select count(*)::int from public.profiles), 1, 'User A sees only their own profile (no directory access)');
select throws_ok(
  $$update public.account_private set date_of_birth = '2000-01-01' where id = '00000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'User A cannot write their date of birth directly (server function only)');
select throws_ok(
  $$update public.account_private set terms_version = 'x', terms_accepted_at = now()$$,
  '42501', null, 'User A cannot write terms acceptance directly');
select throws_ok(
  $$update public.account_private set account_state = 'active'$$,
  '42501', null, 'User A cannot change their account state');
select throws_ok(
  $$update public.account_private set profile_completed_at = now()$$,
  '42501', null, 'User A cannot mark their own profile complete');
select lives_ok(
  $$update public.profiles set hook = 'Late chai, early runs' where id = '00000000-0000-4000-8000-00000000000a'$$,
  'User A can edit their own hook');
select throws_ok(
  $$update public.profiles set hook = repeat('x', 31) where id = '00000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'the hook is limited to 30 characters');
select throws_ok(
  $$update public.profiles set created_at = now() where id = '00000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'User A cannot edit non-editable profile columns');

update public.profiles set hook = 'overwrite attempt' where id = '00000000-0000-4000-8000-00000000000b';
reset role;
select is(
  (select hook from public.profiles where id = '00000000-0000-4000-8000-00000000000b'),
  null,
  'User A''s update of User B''s profile affected nothing'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
select throws_ok('select * from public.admin_roles', '42501', null, 'admin_roles is not readable');
select throws_ok('select * from public.audit_events', '42501', null, 'audit_events is not readable');
select throws_ok(
  $$insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b')$$,
  '42501', null, 'blocks are created only through server functions');
select is(
  (select count(*)::int from public.app_config where key = 'allowed_email_domains'),
  0,
  'the email domain allowlist is hidden from clients'
);
reset role;

select is((select count(*)::int from storage.buckets where public), 0, 'no storage bucket is public');

select * from finish();
rollback;
