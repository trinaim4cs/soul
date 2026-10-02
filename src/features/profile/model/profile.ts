import { z } from 'zod';

/** Profile rules shared with the server (supabase/migrations/…_profile.sql, DECISIONS D-041). */
export const HOOK_MAX = 30;
export const ABOUT_MAX = 1000;
export const NAME_MAX = 30;
export const MAX_PHOTOS = 6;

export const GENDERS = ['woman', 'man', 'non_binary'] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABEL: Record<Gender, string> = {
  woman: 'Woman',
  man: 'Man',
  non_binary: 'Non-binary',
};

/** Plural labels for "Show me". */
export const SHOW_ME_LABEL: Record<Gender, string> = {
  woman: 'Women',
  man: 'Men',
  non_binary: 'Non-binary people',
};

export const PRIVACY_MODES = ['normal', 'private', 'anonymous'] as const;
export type PrivacyMode = (typeof PRIVACY_MODES)[number];

export const ZODIAC_SIGNS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const;
export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

export function zodiacLabel(sign: ZodiacSign): string {
  return sign.charAt(0).toUpperCase() + sign.slice(1);
}

const photoSchema = z.object({
  id: z.string().uuid(),
  storage_path: z.string(),
  blurred_path: z.string(),
  position: z.number().int(),
  status: z.enum(['pending', 'approved', 'rejected']),
  width: z.number().int(),
  height: z.number().int(),
});
export type ProfilePhoto = z.infer<typeof photoSchema>;

export const myProfileSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  hook: z.string().nullable(),
  about: z.string().nullable(),
  gender: z.enum(GENDERS).nullable(),
  privacy_mode: z.enum(PRIVACY_MODES),
  reveal_on_match: z.boolean(),
  zodiac_visible: z.boolean(),
  zodiac: z.enum(ZODIAC_SIGNS).nullable(),
  age: z.number().int().nullable(),
  verified: z.boolean(),
  complete: z.boolean(),
  show_me: z.array(z.enum(GENDERS)),
  photos: z.array(photoSchema),
});
export type MyProfile = z.infer<typeof myProfileSchema>;

export type MissingField = 'photo' | 'name' | 'gender' | 'show_me' | 'hook';

export type ProfileFormValues = {
  name: string;
  gender: Gender | null;
  showMe: Gender[];
  hook: string;
  about: string;
};

export function formValuesFrom(profile: MyProfile): ProfileFormValues {
  return {
    name: profile.display_name ?? '',
    gender: profile.gender,
    showMe: profile.show_me,
    hook: profile.hook ?? '',
    about: profile.about ?? '',
  };
}

/** Fields the form itself can check before saving (photos are checked by the caller). */
export function missingFormFields(values: ProfileFormValues): MissingField[] {
  const missing: MissingField[] = [];
  if (!cleanText(values.name)) missing.push('name');
  if (!values.gender) missing.push('gender');
  if (values.showMe.length === 0) missing.push('show_me');
  if (!cleanText(values.hook)) missing.push('hook');
  return missing;
}

/** The same completeness rule the server applies in submit_profile (client copy for UX only). */
export function missingFields(profile: MyProfile): MissingField[] {
  const missing: MissingField[] = [];
  if (!profile.photos.some((photo) => photo.status !== 'rejected')) missing.push('photo');
  if (!profile.display_name?.trim()) missing.push('name');
  if (!profile.gender) missing.push('gender');
  if (profile.show_me.length === 0) missing.push('show_me');
  if (!profile.hook?.trim()) missing.push('hook');
  return missing;
}

/** Trims and collapses inner whitespace; the server enforces the length limits. */
export function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** About Me keeps line breaks but not runs of blank lines. */
export function cleanAbout(value: string): string {
  return value
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Toggle membership in the "show me" set, keeping the canonical order. */
export function toggleGender(selected: readonly Gender[], gender: Gender): Gender[] {
  const next = selected.includes(gender)
    ? selected.filter((item) => item !== gender)
    : [...selected, gender];
  return GENDERS.filter((item) => next.includes(item));
}
