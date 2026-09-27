import type { Gender, ZodiacSign } from '@/features/profile/model/profile';

/** The age filter's range in the app; the server accepts 18 to 100 (preferences check). */
export const AGE_MIN = 18;
export const AGE_MAX = 60;

export type DiscoveryFilters = {
  minAge: number;
  maxAge: number;
  showMe: Gender[];
  /** Empty means any sign. */
  zodiac: ZodiacSign[];
};

/** Keeps both ends inside the allowed range with min ≤ max, moving the other end if needed. */
export function clampRange(minAge: number, maxAge: number, changed: 'min' | 'max') {
  let min = Math.min(AGE_MAX, Math.max(AGE_MIN, Math.round(minAge)));
  let max = Math.min(AGE_MAX, Math.max(AGE_MIN, Math.round(maxAge)));
  if (min > max) {
    if (changed === 'min') max = min;
    else min = max;
  }
  return { minAge: min, maxAge: max };
}
