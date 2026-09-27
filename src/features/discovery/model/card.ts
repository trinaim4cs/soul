import { z } from 'zod';

import type { ProfileViewModel } from '@/features/profile/components/profile-view';
import { GENDERS, GENDER_LABEL, ZODIAC_SIGNS, zodiacLabel } from '@/features/profile/model/profile';

/** A candidate as `discovery_feed` / `get_profile_card` return it (D-042). */
export const cardSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  anonymous: z.boolean(),
  gender: z.enum(GENDERS).nullable(),
  age: z.number().int(),
  verified: z.boolean(),
  hook: z.string().nullable(),
  about: z.string().nullable(),
  zodiac: z.enum(ZODIAC_SIGNS).nullable(),
  hot_person: z.boolean(),
  photos: z
    .array(
      z.object({
        bucket: z.enum(['profile-photos', 'profile-photos-blurred']),
        path: z.string(),
      }),
    )
    .min(1),
});
export type DiscoveryCard = z.infer<typeof cardSchema>;

export const feedSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), cards: z.array(cardSchema) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export type SwipeDirection = 'like' | 'pass';

/** Every photo of one card lives in one bucket (originals, or blurred copies when anonymous). */
export function cardBucket(card: DiscoveryCard) {
  return card.photos[0]!.bucket;
}

export function cardPhotoPaths(card: DiscoveryCard): string[] {
  return card.photos.map((photo) => photo.path);
}

/** Short identity line for the swipe card: "Name, 22" or "Anonymous, 22". */
export function cardTitle(card: DiscoveryCard): string {
  return `${card.anonymous || !card.name ? 'Anonymous' : card.name}, ${card.age}`;
}

export function toProfileView(
  card: DiscoveryCard,
  urls: Record<string, string> | undefined,
): ProfileViewModel {
  return {
    name: card.anonymous ? null : card.name,
    age: card.age,
    gender: card.gender ? GENDER_LABEL[card.gender] : null,
    verified: card.verified,
    hook: card.hook,
    about: card.about,
    zodiac: card.zodiac ? zodiacLabel(card.zodiac) : null,
    hotPerson: card.hot_person,
    photos: cardPhotoPaths(card)
      .map((path) => urls?.[path])
      .filter((url): url is string => Boolean(url)),
    anonymous: card.anonymous,
  };
}
