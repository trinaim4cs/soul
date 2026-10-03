-- Phase 16: structural guarantees across the whole schema (spec 70 "RLS", SECURITY_MODEL 5).
-- These do not test one feature: they fail when any future table or function forgets a rule.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(12);

-- ---------------------------------------------------------------- tables
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '{}'::text[], 'every public table has row level security');
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relforcerowsecurity),
  '{}'::text[], 'and it is forced, even for the table owner');
select is(
  (select coalesce(array_agg(distinct table_name::text), '{}') from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'),
  '{}'::text[], 'signed-out visitors have no access to any table');
select is(
  (select coalesce(array_agg(distinct table_name::text || ':' || privilege_type), '{}')
   from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  '{}'::text[], 'the app writes no table directly: every change goes through a server function');
select is(
  (select array_agg(distinct table_name::text order by table_name::text) from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'UPDATE'),
  array['preferences', 'profiles'], 'except the owner''s own profile and preference columns');
select is(
  (select coalesce(array_agg(distinct column_name::text order by column_name::text), '{}')
   from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'UPDATE'
     and table_name = 'profiles'),
  array['about', 'display_name', 'gender', 'hook', 'privacy_mode', 'read_receipts', 'reveal_on_match',
        'zodiac_visible'],
  'and on profiles only the fields a person edits themselves');
select is(
  (select coalesce(array_agg(distinct table_name::text), '{}') from information_schema.role_table_grants
   where grantee in ('anon', 'authenticated') and table_schema = 'private'),
  '{}'::text[], 'nothing in the private schema is readable by the app');

-- ---------------------------------------------------------------- functions
select is(
  (select coalesce(array_agg(n.nspname || '.' || p.proname order by p.proname), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  '{}'::text[], 'every security definer function pins its search path');
select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')),
  '{}'::text[], 'signed-out visitors can call no function');
select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like any (array['payment\_%', 'push\_%', 'account\_prepare%'])
     and has_function_privilege('authenticated', p.oid, 'execute')),
  '{}'::text[], 'the app cannot call the service-only payment, push or deletion functions');

-- ---------------------------------------------------------------- storage and realtime
select is(
  (select coalesce(array_agg(id order by id), '{}') from storage.buckets where public),
  '{}'::text[], 'no storage bucket is public');
select ok(
  exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
          and policyname = 'soul_receive_broadcast'),
  'realtime topics are authorized by a policy');

select * from finish();
rollback;
