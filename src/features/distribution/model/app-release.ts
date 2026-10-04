import { z } from 'zod';

/** `app_config.android_release` (DECISIONS D-039, migration …1004000100_android_release.sql). */
export const androidReleaseSchema = z.object({
  latest_version: z.string().nullable(),
  latest_version_code: z.number().int().nonnegative(),
  min_version_code: z.number().int().nonnegative(),
  apk_url: z
    .string()
    .regex(/^https:\/\//)
    .nullable(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
});

export type AndroidRelease = z.infer<typeof androidReleaseSchema>;

export type UpdateNeed = 'none' | 'optional' | 'required';

/**
 * Whether this installed build should update: required below the oldest supported build,
 * optional below the latest. Without a download address there is nothing to offer.
 */
export function updateNeed(
  installedCode: number | null,
  release: AndroidRelease | null,
): UpdateNeed {
  if (installedCode === null || !release?.apk_url) return 'none';
  if (installedCode < release.min_version_code) return 'required';
  if (installedCode < release.latest_version_code) return 'optional';
  return 'none';
}
