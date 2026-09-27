import { z } from 'npm:zod@4';

import { requireUser, serviceClient } from '../_shared/auth.ts';
import { HttpError, handler, json } from '../_shared/http.ts';
import { cleanJpeg, isProfilePhotoSize, isTinyPhotoSize, JpegError } from '../_shared/jpeg.ts';
import { parseBody } from '../_shared/validate.ts';

// Profile photo intake and removal (DECISIONS D-043). The app uploads into the private
// `photo-uploads` inbox; this function checks each file, strips metadata, publishes the
// clean copies and registers the photo. Only this function writes or deletes published
// photo objects.

const INBOX = 'photo-uploads';
const PHOTOS = 'profile-photos';
const BLURRED = 'profile-photos-blurred';

const body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    id: z.uuid(),
    source: z.enum(['camera', 'library']),
  }),
  z.object({ action: z.literal('remove'), id: z.uuid() }),
]);

type Service = ReturnType<typeof serviceClient>;

async function download(service: Service, bucket: string, path: string) {
  const { data, error } = await service.storage.from(bucket).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function publish(service: Service, bucket: string, path: string, bytes: Uint8Array) {
  const { error } = await service.storage
    .from(bucket)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });
  return !error;
}

async function add(userId: string, id: string, source: 'camera' | 'library') {
  const service = serviceClient();
  const full = `${userId}/${id}.jpg`;
  const tiny = `${userId}/${id}.tiny.jpg`;
  const published = `${userId}/${id}.jpg`;

  try {
    const [fullBytes, tinyBytes] = await Promise.all([
      download(service, INBOX, full),
      download(service, INBOX, tiny),
    ]);
    if (!fullBytes || !tinyBytes) return { ok: false, reason: 'upload_missing' } as const;

    let photo;
    let blurred;
    try {
      photo = cleanJpeg(fullBytes);
      blurred = cleanJpeg(tinyBytes);
    } catch (error) {
      if (error instanceof JpegError) return { ok: false, reason: 'invalid_image' } as const;
      throw error;
    }
    if (
      !isProfilePhotoSize(photo.width, photo.height) ||
      !isTinyPhotoSize(blurred.width, blurred.height)
    ) {
      return { ok: false, reason: 'invalid_size' } as const;
    }

    if (!(await publish(service, PHOTOS, published, photo.bytes))) {
      return { ok: false, reason: 'duplicate' } as const;
    }
    if (!(await publish(service, BLURRED, published, blurred.bytes))) {
      await service.storage.from(PHOTOS).remove([published]);
      return { ok: false, reason: 'duplicate' } as const;
    }

    const { data, error } = await service.rpc('add_profile_photo', {
      p_user: userId,
      p_id: id,
      p_width: photo.width,
      p_height: photo.height,
      p_source: source,
    });
    if (error || !data?.ok) {
      await Promise.all([
        service.storage.from(PHOTOS).remove([published]),
        service.storage.from(BLURRED).remove([published]),
      ]);
      if (error) throw new HttpError('internal', 'Could not save the photo.');
      return data as { ok: false; reason: string };
    }
    return data as { ok: true; status: string; position: number };
  } finally {
    // The inbox is emptied whatever happened, so it never fills up.
    await service.storage.from(INBOX).remove([full, tiny]);
  }
}

async function remove(userId: string, id: string) {
  const service = serviceClient();
  const { data, error } = await service.rpc('remove_profile_photo', { p_user: userId, p_id: id });
  if (error) throw new HttpError('internal', 'Could not remove the photo.');
  if (!data?.ok) return data as { ok: false; reason: string };
  const removed = await Promise.all([
    service.storage.from(PHOTOS).remove([data.storage_path]),
    service.storage.from(BLURRED).remove([data.blurred_path]),
  ]);
  if (removed.some((result) => result.error)) {
    // The row is gone, so nobody can be shown the photo; log for the orphan sweep.
    console.error('photo_object_delete_failed');
  }
  return { ok: true } as const;
}

Deno.serve(
  handler(async (req) => {
    if (req.method !== 'POST') throw new HttpError('invalid_request', 'Use POST.');
    const { user } = await requireUser(req);
    const request = await parseBody(req, body);
    const result =
      request.action === 'add'
        ? await add(user.id, request.id, request.source)
        : await remove(user.id, request.id);
    return json(result);
  }),
);
