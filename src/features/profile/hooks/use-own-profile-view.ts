import type { ProfileViewModel } from '@/features/profile/components/profile-view';
import { BLURRED_BUCKET, PHOTO_BUCKET, usePhotoUrls } from '@/features/profile/api/profile';
import { GENDER_LABEL, zodiacLabel, type MyProfile } from '@/features/profile/model/profile';

/**
 * The owner's profile as other students will see it: anonymous mode swaps in the tiny
 * blurred copies and hides the name; zodiac shows only when turned on.
 */
export function useOwnProfileView(profile: MyProfile | undefined): ProfileViewModel | null {
  const anonymous = profile?.privacy_mode === 'anonymous';
  const visible = (profile?.photos ?? []).filter((photo) => photo.status !== 'rejected');
  const bucket = anonymous ? BLURRED_BUCKET : PHOTO_BUCKET;
  const paths = visible.map((photo) => (anonymous ? photo.blurred_path : photo.storage_path));
  const urls = usePhotoUrls(bucket, paths);

  if (!profile) return null;
  return {
    name: anonymous ? null : profile.display_name,
    age: profile.age,
    gender: profile.gender ? GENDER_LABEL[profile.gender] : null,
    verified: profile.verified,
    hook: profile.hook,
    about: profile.about,
    zodiac: profile.zodiac_visible && profile.zodiac ? zodiacLabel(profile.zodiac) : null,
    hotPerson: false,
    photos: paths.map((path) => urls.data?.[path]).filter((url): url is string => Boolean(url)),
    anonymous,
  };
}
