import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { PickedPhoto } from '@/services/camera';

/** Profile photos are portrait 4:5, stored at 1080 × 1350 at most (DECISIONS D-041). */
const TARGET_WIDTH = 1080;
const ASPECT = 4 / 5;
/** Anonymous mode shows only this tiny version, so no detail survives to be recovered. */
const TINY_WIDTH = 24;

export type ProcessedPhoto = {
  full: { base64: string; width: number; height: number };
  tiny: { base64: string };
};

/** Crop box that centres the largest 4:5 area inside the picked image. */
export function portraitCrop(width: number, height: number) {
  if (width / height > ASPECT) {
    const cropWidth = Math.round(height * ASPECT);
    return { originX: Math.round((width - cropWidth) / 2), originY: 0, width: cropWidth, height };
  }
  const cropHeight = Math.round(width / ASPECT);
  return { originX: 0, originY: Math.round((height - cropHeight) / 2), width, height: cropHeight };
}

/**
 * Crops to 4:5, resizes, and re-encodes as JPEG. Re-encoding drops all metadata, including
 * EXIF location (SECURITY_MODEL section 6). Also makes the tiny anonymous-mode version.
 */
export async function processPhoto(photo: PickedPhoto): Promise<ProcessedPhoto> {
  const crop = portraitCrop(photo.width, photo.height);
  const width = Math.min(TARGET_WIDTH, crop.width);

  const context = ImageManipulator.manipulate(photo.uri).crop(crop).resize({ width });
  const fullImage = await context.renderAsync();
  const full = await fullImage.saveAsync({ format: SaveFormat.JPEG, compress: 0.82, base64: true });

  const tinyImage = await ImageManipulator.manipulate(full.uri)
    .resize({ width: TINY_WIDTH })
    .renderAsync();
  const tiny = await tinyImage.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });

  if (!full.base64 || !tiny.base64) throw new Error('photo_processing_failed');
  return {
    full: { base64: full.base64, width: full.width, height: full.height },
    tiny: { base64: tiny.base64 },
  };
}
