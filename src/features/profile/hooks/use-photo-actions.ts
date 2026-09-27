import { useState } from 'react';

import {
  addPhoto,
  makePrimaryPhoto,
  removePhoto,
  type PhotoSource,
} from '@/features/profile/api/profile';
import type { ProfilePhoto } from '@/features/profile/model/profile';
import { camera, type PickResult } from '@/services/camera';

const ERROR_COPY: Record<string, string> = {
  denied: 'Camera access is off. Allow it in your phone settings, or choose a photo instead.',
  too_many_photos: 'You can have up to 6 photos. Remove one to add another.',
  last_photo: 'Your profile needs at least one photo.',
  invalid_size: 'That photo is too small. Choose a larger one.',
};
const FALLBACK = "Couldn't save that photo. Check your connection and try again.";

function messageFor(error: unknown): string {
  const key = error instanceof Error ? error.message : '';
  return ERROR_COPY[key] ?? FALLBACK;
}

/** Camera, gallery, remove and make-main actions with one busy flag and calm error copy. */
export function usePhotoActions(userId: string | null, photos: ProfilePhoto[]) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(task: () => Promise<unknown>) {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function capture(pick: () => Promise<PickResult>, source: PhotoSource) {
    await run(async () => {
      const result = await pick();
      if (result.status === 'denied') throw new Error('denied');
      if (result.status === 'picked' && userId) await addPhoto(userId, result.photo, source);
    });
  }

  return {
    busy,
    error,
    takePhoto: () => capture(camera.takePhoto, 'camera'),
    pickPhoto: () => capture(camera.pickFromLibrary, 'library'),
    remove: (photoId: string) => run(() => removePhoto(userId!, photoId)),
    makePrimary: (photoId: string) => run(() => makePrimaryPhoto(userId!, photos, photoId)),
  };
}
