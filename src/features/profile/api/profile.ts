import { useQuery } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';

import { refreshAccountStatus } from '@/features/auth/api/auth';
import { useDeckStore } from '@/features/discovery/store/deck-store';
import { processPhoto } from '@/features/profile/api/photo-processing';
import {
  cleanAbout,
  cleanText,
  myProfileSchema,
  type Gender,
  type MissingField,
  type MyProfile,
  type PrivacyMode,
  type ProfileFormValues,
  type ProfilePhoto,
} from '@/features/profile/model/profile';
import { base64ToBytes } from '@/lib/base64';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { PickedPhoto } from '@/services/camera';

export const PHOTO_BUCKET = 'profile-photos';
export const BLURRED_BUCKET = 'profile-photos-blurred';

export const myProfileQueryKey = (userId: string) => ['my-profile', userId] as const;

async function fetchMyProfile(): Promise<MyProfile> {
  const { data, error } = await supabase.rpc('get_my_profile');
  if (error) throw error;
  return myProfileSchema.parse(data);
}

/** The signed-in user's own profile (never another user's; see discovery in Phase 6). */
export function useMyProfile(userId: string | null) {
  return useQuery({
    queryKey: myProfileQueryKey(userId ?? 'signed-out'),
    queryFn: fetchMyProfile,
    enabled: userId !== null,
  });
}

function refreshProfile(userId: string) {
  return queryClient.invalidateQueries({ queryKey: myProfileQueryKey(userId) });
}

export type ProfileFields = Partial<{
  display_name: string;
  hook: string;
  about: string | null;
  gender: Gender;
  zodiac_visible: boolean;
  privacy_mode: PrivacyMode;
  reveal_on_match: boolean;
  read_receipts: boolean;
}>;

/** Only the editable columns can change; the server enforces lengths (column grants + checks). */
export async function updateProfileFields(userId: string, fields: ProfileFields) {
  const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
  if (error) throw error;
  await refreshProfile(userId);
}

export async function updateShowMe(userId: string, showMe: Gender[]) {
  const { error } = await supabase
    .from('preferences')
    .update({ show_me: showMe })
    .eq('user_id', userId);
  if (error) throw error;
  // "Show me" also drives Discover and its filters screen.
  await Promise.all([
    refreshProfile(userId),
    queryClient.invalidateQueries({ queryKey: ['discovery-filters', userId] }),
  ]);
  const deck = useDeckStore.getState();
  if (deck.status !== 'idle') void deck.refresh();
}

/** Saves the profile form: text is cleaned here, limits are enforced by the server. */
export async function saveProfileForm(userId: string, values: ProfileFormValues) {
  const about = cleanAbout(values.about);
  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: cleanText(values.name),
      hook: cleanText(values.hook),
      about: about.length > 0 ? about : null,
      ...(values.gender ? { gender: values.gender } : {}),
    })
    .eq('id', userId);
  if (error) throw error;
  await updateShowMe(userId, values.showMe);
}

export type PhotoSource = 'camera' | 'library';

type AddPhotoResult =
  | { ok: true; status: ProfilePhoto['status']; position: number }
  | {
      ok: false;
      reason:
        | 'invalid'
        | 'invalid_size'
        | 'invalid_image'
        | 'upload_missing'
        | 'duplicate'
        | 'too_many_photos';
    };

/** Private inbox the app uploads into; only the server publishes photos (DECISIONS D-043). */
const UPLOAD_BUCKET = 'photo-uploads';

async function invokePhotos<T>(body: Record<string, string>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('profile-photos', { body });
  if (error || !data) throw error ?? new Error('photo_request_failed');
  return data;
}

/**
 * Upload pipeline: process on the device (crop, resize, re-encode, tiny blurred copy) and
 * upload both files into the private inbox. The `profile-photos` Edge Function then checks
 * each file, strips any metadata again, publishes clean copies and registers the photo,
 * applying the photo limit and review rule. The device work is a convenience; the server
 * check is the one that counts.
 */
export async function addPhoto(userId: string, picked: PickedPhoto, source: PhotoSource) {
  const processed = await processPhoto(picked);
  const id = randomUUID();
  const fullPath = `${userId}/${id}.jpg`;
  const tinyPath = `${userId}/${id}.tiny.jpg`;
  const upload = { contentType: 'image/jpeg', upsert: false } as const;
  const inbox = supabase.storage.from(UPLOAD_BUCKET);

  const full = await inbox.upload(fullPath, base64ToBytes(processed.full.base64), upload);
  if (full.error) throw full.error;
  const tiny = await inbox.upload(tinyPath, base64ToBytes(processed.tiny.base64), upload);
  if (tiny.error) {
    await inbox.remove([fullPath]);
    throw tiny.error;
  }

  let result: AddPhotoResult;
  try {
    result = await invokePhotos<AddPhotoResult>({ action: 'add', id, source });
  } catch (caught) {
    // The server empties the inbox itself; this only matters if the request never arrived.
    await inbox.remove([fullPath, tinyPath]);
    throw caught;
  }
  if (!result.ok) throw new Error(result.reason);
  await refreshProfile(userId);
  return result;
}

type RemovePhotoResult = { ok: true } | { ok: false; reason: 'not_found' | 'last_photo' };

/** The server removes the row and deletes both published files. */
export async function removePhoto(userId: string, photoId: string) {
  const result = await invokePhotos<RemovePhotoResult>({ action: 'remove', id: photoId });
  if (!result.ok) throw new Error(result.reason);
  await refreshProfile(userId);
}

/** Moves one photo to the front; the first photo is the primary one. */
export async function makePrimaryPhoto(userId: string, photos: ProfilePhoto[], photoId: string) {
  const order = [photoId, ...photos.map((photo) => photo.id).filter((id) => id !== photoId)];
  const { data, error } = await supabase.rpc('reorder_profile_photos', { p_ids: order });
  if (error) throw error;
  if (!(data as { ok: boolean }).ok) throw new Error('invalid_order');
  await refreshProfile(userId);
}

type SubmitResult =
  | { ok: true }
  | { ok: false; reason: 'earlier_steps_incomplete' }
  | { ok: false; reason: 'missing'; missing: MissingField[] };

/** Asks the server to confirm the profile is complete; on success the app becomes eligible. */
export async function submitProfile(userId: string): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc('submit_profile');
  if (error) throw error;
  const result = data as SubmitResult;
  if (result.ok) {
    await Promise.all([refreshProfile(userId), refreshAccountStatus(userId)]);
  }
  return result;
}

/** Short-lived signed URLs for the owner's own photos (the buckets are private). */
export function usePhotoUrls(bucket: string, paths: string[]) {
  return useQuery({
    queryKey: ['photo-urls', bucket, ...paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
      if (error) throw error;
      const urls: Record<string, string> = {};
      for (const item of data) if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
      return urls;
    },
  });
}
