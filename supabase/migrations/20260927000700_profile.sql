-- SOUL Phase 5: profile (spec v2 sections 14 to 17, 20; DECISIONS D-041).
-- Gender and "show me", photos with review states, completion checks, and the owner's
-- own profile read model. Other users never read these tables directly: discovery and
-- match functions (Phase 6+) return whitelisted projections with signed photo URLs.

create type public.gender as enum ('woman', 'man', 'non_binary');
create type public.photo_status as enum ('pending', 'approved', 'rejected');

------------------------------------------------------------------------------
-- Public profile fields: gender is shown on the profile (spec 15).
------------------------------------------------------------------------------
alter table public.profiles add column gender public.gender;
grant update (gender) on public.profiles to authenticated;

------------------------------------------------------------------------------
-- preferences: private to the owner. "Who they want to see" now; the discovery
-- filters (age range, zodiac) are used from Phase 6.
------------------------------------------------------------------------------
create table public.preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  show_me public.gender[] not null default '{}',
  min_age smallint not null default 18,
  max_age smallint not null default 30,
  zodiac_filter text[],
  updated_at timestamptz not null default now(),
  constraint show_me_distinct check (cardinality(show_me) <= 3),
  constraint age_range_valid check (min_age >= 18 and max_age <= 100 and min_age <= max_age),
  constraint zodiac_filter_valid check (
    zodiac_filter is null or zodiac_filter <@ array[
      'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
      'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
    ]::text[]
  )
);

create trigger preferences_touch before update on public.preferences
  for each row execute function private.touch_updated_at();

alter table public.preferences enable row level security;
alter table public.preferences force row level security;

create policy preferences_owner_read on public.preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy preferences_owner_update on public.preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.preferences from anon, authenticated;
grant select on public.preferences to authenticated;
grant update (show_me, min_age, max_age, zodiac_filter) on public.preferences to authenticated;

-- Existing accounts get a preferences row; new ones get it from handle_new_user below.
insert into public.preferences (user_id) select id from auth.users on conflict do nothing;

------------------------------------------------------------------------------
-- profile_photos: owner reads own rows; every write goes through the functions below.
------------------------------------------------------------------------------
create table public.profile_photos (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Object names in the profile-photos and profile-photos-blurred buckets.
  storage_path text not null,
  blurred_path text not null,
  position smallint not null,
  status public.photo_status not null,
  source text not null,
  width integer not null,
  height integer not null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  -- Deferred so positions can be renumbered in one statement (reorder, remove).
  constraint profile_photos_position_unique unique (user_id, position) deferrable initially deferred,
  constraint photo_source_valid check (source in ('camera', 'library')),
  constraint photo_position_valid check (position between 0 and 5),
  constraint photo_size_valid check (width between 200 and 4000 and height between 200 and 4000),
  constraint photo_paths_owned check (
    storage_path = user_id::text || '/' || id::text || '.jpg'
    and blurred_path = user_id::text || '/' || id::text || '.jpg'
  )
);

create index profile_photos_status_idx on public.profile_photos (status) where status = 'pending';

alter table public.profile_photos enable row level security;
alter table public.profile_photos force row level security;

create policy profile_photos_owner_read on public.profile_photos
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.profile_photos from anon, authenticated;
grant select on public.profile_photos to authenticated;

------------------------------------------------------------------------------
-- Blurred derivatives for anonymous mode: the owner writes into their own folder.
-- Nobody else reads the bucket; discovery hands out signed URLs (Phase 6).
------------------------------------------------------------------------------
create policy profile_photos_blurred_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos-blurred' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy profile_photos_blurred_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-photos-blurred' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy profile_photos_blurred_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-photos-blurred' and (storage.foldername(name))[1] = (select auth.uid())::text);

------------------------------------------------------------------------------
-- Config: photo review (D-041). When true, new photos wait for a moderator (Phase 15).
------------------------------------------------------------------------------
insert into public.app_config (key, value, client_visible, description) values
  ('photo_review_required', 'false', true,
   'When true, new profile photos stay pending until a moderator approves them (D-041).'),
  ('max_profile_photos', '6', true, 'Maximum photos per profile (D-041).')
on conflict (key) do nothing;

create function private.config_value(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.app_config where key = p_key;
$$;
revoke all on function private.config_value(text) from public, anon, authenticated;

------------------------------------------------------------------------------
-- add_profile_photo: registers an uploaded photo after checking both objects exist in
-- the caller's own folders. Uploads happen first, directly to storage.
------------------------------------------------------------------------------
create function public.add_profile_photo(
  p_id uuid, p_width integer, p_height integer, p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  object_name text;
  photo_count integer;
  max_photos integer := coalesce((private.config_value('max_profile_photos'))::int, 6);
  review boolean := coalesce((private.config_value('photo_review_required'))::boolean, false);
  new_status public.photo_status;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_id is null or p_source not in ('camera', 'library') then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if p_width is null or p_height is null
     or p_width not between 200 and 4000 or p_height not between 200 and 4000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_size');
  end if;

  object_name := uid::text || '/' || p_id::text || '.jpg';
  if not exists (
    select 1 from storage.objects where bucket_id = 'profile-photos' and name = object_name
  ) or not exists (
    select 1 from storage.objects where bucket_id = 'profile-photos-blurred' and name = object_name
  ) then
    return jsonb_build_object('ok', false, 'reason', 'upload_missing');
  end if;

  -- Serialise concurrent adds for this user.
  perform 1 from public.profiles where id = uid for update;
  select count(*) into photo_count from public.profile_photos where user_id = uid;
  if photo_count >= max_photos then
    return jsonb_build_object('ok', false, 'reason', 'too_many_photos');
  end if;

  new_status := case when review then 'pending' else 'approved' end;
  insert into public.profile_photos
    (id, user_id, storage_path, blurred_path, position, status, source, width, height, reviewed_at)
  values
    (p_id, uid, object_name, object_name, photo_count, new_status, p_source, p_width, p_height,
     case when review then null else now() end)
  on conflict (id) do nothing;

  return jsonb_build_object('ok', true, 'status', new_status, 'position', photo_count);
end;
$$;

------------------------------------------------------------------------------
-- remove_profile_photo: a completed profile always keeps at least one photo.
-- Returns the object names so the client deletes them from storage.
------------------------------------------------------------------------------
create function public.remove_profile_photo(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  photo public.profile_photos%rowtype;
  photo_count integer;
  completed boolean;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id = uid for update;

  select * into photo from public.profile_photos where id = p_id and user_id = uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select count(*) into photo_count from public.profile_photos where user_id = uid;
  select profile_completed_at is not null into completed from public.account_private where id = uid;
  if completed and photo_count <= 1 then
    return jsonb_build_object('ok', false, 'reason', 'last_photo');
  end if;

  delete from public.profile_photos where id = p_id;
  -- Close the gap in positions, keeping order.
  with ordered as (
    select id, row_number() over (order by position) - 1 as new_position
    from public.profile_photos where user_id = uid
  )
  update public.profile_photos p set position = o.new_position
  from ordered o where p.id = o.id;

  return jsonb_build_object('ok', true, 'storage_path', photo.storage_path, 'blurred_path', photo.blurred_path);
end;
$$;

------------------------------------------------------------------------------
-- reorder_profile_photos: the first id becomes the primary photo.
------------------------------------------------------------------------------
create function public.reorder_profile_photos(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  owned uuid[];
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id = uid for update;

  select coalesce(array_agg(id order by id), '{}') into owned
  from public.profile_photos where user_id = uid;
  if p_ids is null
     or cardinality(p_ids) <> cardinality(owned)
     or (select array_agg(x order by x) from unnest(p_ids) as x) is distinct from owned then
    return jsonb_build_object('ok', false, 'reason', 'invalid_order');
  end if;

  update public.profile_photos p set position = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where p.id = o.id and p.user_id = uid;

  return jsonb_build_object('ok', true);
end;
$$;

------------------------------------------------------------------------------
-- submit_profile: server-side completeness check; marks the profile step done.
------------------------------------------------------------------------------
create function public.submit_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  prof public.profiles%rowtype;
  prefs public.preferences%rowtype;
  acct public.account_private%rowtype;
  missing text[] := '{}';
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into acct from public.account_private where id = uid for update;
  if acct.institutional_email_verified_at is null
     or acct.terms_version is distinct from private.current_terms_version()
     or acct.date_of_birth is null then
    return jsonb_build_object('ok', false, 'reason', 'earlier_steps_incomplete');
  end if;

  select * into prof from public.profiles where id = uid;
  select * into prefs from public.preferences where user_id = uid;

  if not exists (select 1 from public.profile_photos where user_id = uid and status <> 'rejected') then
    missing := array_append(missing, 'photo');
  end if;
  if prof.display_name is null or char_length(btrim(prof.display_name)) = 0 then
    missing := array_append(missing, 'name');
  end if;
  if prof.gender is null then
    missing := array_append(missing, 'gender');
  end if;
  if prefs.user_id is null or cardinality(prefs.show_me) = 0 then
    missing := array_append(missing, 'show_me');
  end if;
  if prof.hook is null or char_length(btrim(prof.hook)) = 0 then
    missing := array_append(missing, 'hook');
  end if;

  if cardinality(missing) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'missing', 'missing', to_jsonb(missing));
  end if;

  update public.account_private set profile_completed_at = coalesce(profile_completed_at, now())
  where id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

------------------------------------------------------------------------------
-- get_my_profile: the owner's own profile, including derived age and zodiac.
------------------------------------------------------------------------------
create function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'hook', p.hook,
    'about', p.about,
    'gender', p.gender,
    'privacy_mode', p.privacy_mode,
    'zodiac_visible', p.zodiac_visible,
    'zodiac', private.zodiac_for(a.date_of_birth),
    'age', case when a.date_of_birth is null then null
                else extract(year from age(current_date, a.date_of_birth))::int end,
    'verified', a.institutional_email_verified_at is not null,
    'complete', a.profile_completed_at is not null,
    'show_me', coalesce(to_jsonb(pr.show_me), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ph.id,
        'storage_path', ph.storage_path,
        'blurred_path', ph.blurred_path,
        'position', ph.position,
        'status', ph.status,
        'width', ph.width,
        'height', ph.height
      ) order by ph.position)
      from public.profile_photos ph where ph.user_id = p.id
    ), '[]'::jsonb)
  )
  from public.profiles p
  join public.account_private a on a.id = p.id
  left join public.preferences pr on pr.user_id = p.id
  where p.id = (select auth.uid());
$$;

revoke all on function public.add_profile_photo(uuid, integer, integer, text) from public, anon;
revoke all on function public.remove_profile_photo(uuid) from public, anon;
revoke all on function public.reorder_profile_photos(uuid[]) from public, anon;
revoke all on function public.submit_profile() from public, anon;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.add_profile_photo(uuid, integer, integer, text) to authenticated;
grant execute on function public.remove_profile_photo(uuid) to authenticated;
grant execute on function public.reorder_profile_photos(uuid[]) to authenticated;
grant execute on function public.submit_profile() to authenticated;
grant execute on function public.get_my_profile() to authenticated;

------------------------------------------------------------------------------
-- New users also get a preferences row.
------------------------------------------------------------------------------
create function private.handle_new_user_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_preferences
  after insert on auth.users
  for each row execute function private.handle_new_user_preferences();
