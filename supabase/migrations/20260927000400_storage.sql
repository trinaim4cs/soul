-- SOUL Phase 3: storage buckets. Nothing is public (SECURITY_MODEL section 6).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-photos', 'profile-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('profile-photos-blurred', 'profile-photos-blurred', false, 2097152, array['image/jpeg', 'image/webp']),
  ('report-evidence', 'report-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('chat-media', 'chat-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

-- profile-photos: an owner manages only objects under their own `{uid}/` folder.
-- Other users never read this bucket directly; they receive short-lived signed URLs
-- for approved photos from server functions (Phase 5/7).
create policy profile_photos_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy profile_photos_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy profile_photos_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- profile-photos-blurred and report-evidence: no client policies at all.
-- (No verification-document bucket: verification is SRMIST email + OTP only, D-027.)
-- Uploads use short-lived signed upload URLs issued by server functions; reads are
-- service-role only. chat-media policies arrive with the moderated chat photos feature.
