-- SOUL Phase 3: foundation schemas, extensions, enums and shared helpers.
-- Security model: SECURITY_MODEL.md. Default deny: RLS on every table, explicit grants only.

-- PostGIS: used only by Instant Meet (1 km server-side proximity, DECISIONS D-031).
create extension if not exists postgis with schema extensions;

-- Internal schema: never exposed through the Data API (only `public` is).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- The anon role gets nothing in public beyond what is explicitly granted.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke execute on functions from public;

create type public.account_state as enum ('active', 'suspended', 'banned', 'deletion_pending');
create type public.privacy_mode as enum ('normal', 'private', 'anonymous');
create type public.admin_role as enum ('moderator', 'admin');

-- updated_at maintenance
create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
