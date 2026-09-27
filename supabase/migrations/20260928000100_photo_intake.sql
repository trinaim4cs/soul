-- SOUL: server-side photo intake (DECISIONS D-043).
--
-- The app is untrusted, so the server, not the app, decides what a published photo contains.
--   1. The app uploads its processed photo into a private inbox (`photo-uploads`).
--   2. The `profile-photos` Edge Function checks it is a real JPEG of the expected size and
--      shape, strips every metadata segment (EXIF, GPS, XMP, ICC, comments), and writes the
--      clean copies into `profile-photos` and `profile-photos-blurred` itself.
--   3. It then registers the photo and empties the inbox.
-- Clients can no longer write or delete the published objects, so a registered photo cannot
-- be swapped for different bytes afterwards.

------------------------------------------------------------------------------
-- Inbox bucket: JPEG only, 3 MB at most (the app sends about 0.3 MB).
------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photo-uploads', 'photo-uploads', false, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

-- True while the caller has fewer than four objects waiting (two photos in flight), which
-- bounds how much an account can park in the inbox. The Edge Function empties it.
create function private.photo_inbox_has_room()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < 4
  from storage.objects
  where bucket_id = 'photo-uploads'
    and name like (select auth.uid())::text || '/%';
$$;
revoke all on function private.photo_inbox_has_room() from public, anon, authenticated;
grant execute on function private.photo_inbox_has_room() to authenticated;

-- Only `{uid}/{photo id}.jpg` and `{uid}/{photo id}.tiny.jpg`, in the caller's own folder.
create policy photo_uploads_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photo-uploads'
    and name ~ ('^' || (select auth.uid())::text
                || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.tiny)?\.jpg$')
    and private.photo_inbox_has_room()
  );

-- Select is required by Storage to delete; both let the app clean up a failed upload.
create policy photo_uploads_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'photo-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy photo_uploads_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'photo-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

------------------------------------------------------------------------------
-- Published photos: owners keep read access; only the server writes or deletes.
------------------------------------------------------------------------------
drop policy profile_photos_owner_insert on storage.objects;
drop policy profile_photos_owner_delete on storage.objects;
drop policy profile_photos_blurred_owner_insert on storage.objects;
drop policy profile_photos_blurred_owner_delete on storage.objects;

-- Published objects are always JPEG now; the extra types were never used.
update storage.buckets
  set allowed_mime_types = array['image/jpeg'], file_size_limit = 3145728
  where id = 'profile-photos';
update storage.buckets
  set allowed_mime_types = array['image/jpeg'], file_size_limit = 65536
  where id = 'profile-photos-blurred';

------------------------------------------------------------------------------
-- add_profile_photo / remove_profile_photo: now called only by the Edge Function, which
-- passes the caller's id after resolving their JWT. Width and height are read from the
-- file by the server, not taken from the app.
------------------------------------------------------------------------------
drop function public.add_profile_photo(uuid, integer, integer, text);
drop function public.remove_profile_photo(uuid);

create function public.add_profile_photo(
  p_user uuid, p_id uuid, p_width integer, p_height integer, p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_name text;
  photo_count integer;
  max_photos integer := coalesce((private.config_value('max_profile_photos'))::int, 6);
  review boolean := coalesce((private.config_value('photo_review_required'))::boolean, false);
  new_status public.photo_status;
begin
  if p_user is null or p_id is null or p_source is null or p_source not in ('camera', 'library') then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if p_width is null or p_height is null
     or p_width not between 200 and 4000 or p_height not between 200 and 4000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_size');
  end if;

  object_name := p_user::text || '/' || p_id::text || '.jpg';
  if not exists (
    select 1 from storage.objects where bucket_id = 'profile-photos' and name = object_name
  ) or not exists (
    select 1 from storage.objects where bucket_id = 'profile-photos-blurred' and name = object_name
  ) then
    return jsonb_build_object('ok', false, 'reason', 'upload_missing');
  end if;

  -- Serialise concurrent adds for this user.
  perform 1 from public.profiles where id = p_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if exists (select 1 from public.profile_photos where id = p_id) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;
  select count(*) into photo_count from public.profile_photos where user_id = p_user;
  if photo_count >= max_photos then
    return jsonb_build_object('ok', false, 'reason', 'too_many_photos');
  end if;

  new_status := case when review then 'pending' else 'approved' end;
  insert into public.profile_photos
    (id, user_id, storage_path, blurred_path, position, status, source, width, height, reviewed_at)
  values
    (p_id, p_user, object_name, object_name, photo_count, new_status, p_source, p_width, p_height,
     case when review then null else now() end);

  return jsonb_build_object('ok', true, 'status', new_status, 'position', photo_count);
end;
$$;

-- A completed profile always keeps at least one photo. Returns the object names so the
-- Edge Function deletes them from Storage.
create function public.remove_profile_photo(p_user uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  photo public.profile_photos%rowtype;
  photo_count integer;
  completed boolean;
begin
  if p_user is null or p_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  perform 1 from public.profiles where id = p_user for update;

  select * into photo from public.profile_photos where id = p_id and user_id = p_user;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select count(*) into photo_count from public.profile_photos where user_id = p_user;
  select profile_completed_at is not null into completed from public.account_private where id = p_user;
  if completed and photo_count <= 1 then
    return jsonb_build_object('ok', false, 'reason', 'last_photo');
  end if;

  delete from public.profile_photos where id = p_id;
  -- Close the gap in positions, keeping order.
  with ordered as (
    select id, row_number() over (order by position) - 1 as new_position
    from public.profile_photos where user_id = p_user
  )
  update public.profile_photos p set position = o.new_position
  from ordered o where p.id = o.id;

  return jsonb_build_object('ok', true, 'storage_path', photo.storage_path, 'blurred_path', photo.blurred_path);
end;
$$;

revoke all on function public.add_profile_photo(uuid, uuid, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.remove_profile_photo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_profile_photo(uuid, uuid, integer, integer, text) to service_role;
grant execute on function public.remove_profile_photo(uuid, uuid) to service_role;
