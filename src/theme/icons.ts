/**
 * The icon glyphs SOUL ships: Material Symbols (Apache-2.0), the single icon family.
 *
 * The icon font in `assets/fonts` (`SoulIcons-Light.ttf`, `SoulIcons-Regular.ttf`) is a
 * subset holding only these code points, a few kilobytes instead of ~1 MB per weight.
 * After changing this map, run `npm run icons:subset` and rebuild the Android app.
 * Code points come from `expo-symbols/build/android/symbols.json` (a test checks them).
 */
export const iconGlyphs = {
  add: 0xe145,
  add_box: 0xe146,
  arrow_back: 0xe5c4,
  block: 0xe14b,
  chat_bubble: 0xe0ca,
  check: 0xe5ca,
  chevron_right: 0xe5cc,
  close: 0xe5cd,
  download: 0xf090,
  edit: 0xe3c9,
  error: 0xe000,
  explore_off: 0xe9a8,
  favorite: 0xe87d,
  flag: 0xe153,
  hourglass_empty: 0xe88b,
  info: 0xe88e,
  ios_share: 0xe6b8,
  local_fire_department: 0xef55,
  location_off: 0xe0c7,
  location_on: 0xe0c8,
  lock: 0xe897,
  logout: 0xe9ba,
  more_vert: 0xe5d4,
  navigation: 0xe55d,
  near_me: 0xe569,
  person: 0xe7fd,
  photo_camera: 0xe412,
  photo_library: 0xe413,
  remove: 0xe15b,
  send: 0xe163,
  settings: 0xe8b8,
  shield: 0xe9e0,
  style: 0xe41d,
  timer: 0xe425,
  tune: 0xe429,
  verified: 0xef76,
  visibility_off: 0xe8f5,
  wifi_off: 0xe648,
} as const;

export type IconName = keyof typeof iconGlyphs;

/** Registered natively (expo-font config plugin) and on the web (`fonts.web.ts`). */
export const iconFontFamily = 'SoulIcons';

export function iconGlyph(name: IconName): string {
  return String.fromCodePoint(iconGlyphs[name]);
}
