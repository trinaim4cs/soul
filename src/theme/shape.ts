import { StyleSheet } from 'react-native';

/**
 * One radius scale, assigned by role (shape lock):
 * buttons and badges use `full`; inputs use `md`; photos use `lg`; sheets use `xl` (top corners).
 */
export const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  full: 9999,
} as const;

export const borders = {
  hairline: StyleSheet.hairlineWidth,
  thin: 1,
  strong: 1.5,
} as const;

/**
 * Elevation as `boxShadow` strings (New Architecture, Android supported). Used sparingly:
 * floating composer, sheets and overlays. In the dark appearance, separation comes from
 * surfaces and borders instead.
 */
export const shadows = {
  floating: '0 6px 24px rgba(0, 0, 0, 0.10)',
  overlay: '0 12px 40px rgba(0, 0, 0, 0.16)',
  none: 'none',
} as const;

/** Stacking order for overlays. */
export const layers = {
  base: 0,
  sticky: 10,
  composer: 20,
  floating: 30,
  sheet: 40,
  toast: 50,
  modal: 60,
} as const;
