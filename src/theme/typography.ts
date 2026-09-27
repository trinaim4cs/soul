import type { TextStyle } from 'react-native';

/**
 * SOUL type system (spec section 4, DECISIONS D-021).
 *
 * Two roles, never file names in screens:
 * - `body`: Alegreya Sans (UI, body, chat, inputs, buttons, prices, timers; has `₹`).
 *   Chosen by the owner for an informal, humanist feel. It has a small x-height, so body
 *   roles sit about 1 px larger than a typical UI sans. Weights: 400, 500, 700 (no 600).
 * - `display`: Instrument Serif (page titles, section headings, editorial moments).
 * Families are embedded natively (expo-font config plugin) as weight-mapped font
 * families, so `fontWeight` selects the right file on Android.
 */
export const fontFamily = {
  body: 'AlegreyaSans',
  display: 'InstrumentSerif',
} as const;

type Variant = TextStyle & {
  /** Upper bound for Android font scaling on this role; `undefined` = unbounded. */
  maxFontSizeMultiplier?: number;
  /** Display roles shrink slightly on narrow screens (see `responsiveFontSize`). */
  responsive?: boolean;
};

const display = (size: number, lineHeight: number, letterSpacing: number): Variant => ({
  fontFamily: fontFamily.display,
  fontWeight: '400',
  fontSize: size,
  lineHeight,
  letterSpacing,
  includeFontPadding: false,
  responsive: true,
});

const body = (
  size: number,
  lineHeight: number,
  weight: '400' | '500' | '700',
  letterSpacing = 0,
): Variant => ({
  fontFamily: fontFamily.body,
  fontWeight: weight,
  fontSize: size,
  lineHeight,
  letterSpacing,
});

/**
 * Hierarchy, largest to smallest. Headings vary in size by level; there is no single
 * heading size. Supporting and micro roles are used sparingly.
 */
export const typeScale = {
  /** Brand hero moments (welcome, match reveal). */
  display: { ...display(56, 60, -0.8), maxFontSizeMultiplier: 1.15 },
  /** Page titles. */
  title: { ...display(40, 44, -0.5), maxFontSizeMultiplier: 1.25 },
  /** Major section titles. */
  section: { ...display(30, 34, -0.3), maxFontSizeMultiplier: 1.3 },
  /** Secondary / side headings and premium moments. */
  subheading: { ...display(23, 28, -0.1), maxFontSizeMultiplier: 1.4 },
  /** Comfortable reading text: bios, chat, verification instructions. */
  body: body(18, 26, '400'),
  bodyStrong: body(18, 26, '500'),
  /** Button labels: Bold so calls to action read with confidence. */
  button: { ...body(17, 22, '700', 0.1), maxFontSizeMultiplier: 1.4 },
  /** Tabs, input text, filter controls. */
  label: { ...body(17, 22, '500', 0.1), maxFontSizeMultiplier: 1.4 },
  /** Supporting text: helper copy, secondary metadata. */
  supporting: body(16, 22, '400'),
  caption: body(14, 19, '400', 0.1),
  /** Only where genuinely needed (badges, tiny labels). */
  micro: { ...body(12, 15, '500', 0.6), maxFontSizeMultiplier: 1.3 },
} as const satisfies Record<string, Variant>;

export type TypeVariant = keyof typeof typeScale;

/** Timers, distances, balances and prices stay stable while digits change. */
export const tabularNumbers: TextStyle = { fontVariant: ['tabular-nums'] };

const COMPACT_WIDTH = 360;
const COMPACT_FACTOR = 0.88;

/** Display roles tighten on compact screens so titles do not wrap awkwardly. */
export function responsiveFontSize(
  variant: Variant,
  windowWidth: number,
): Pick<TextStyle, 'fontSize' | 'lineHeight'> {
  if (!variant.responsive || windowWidth >= COMPACT_WIDTH || !variant.fontSize) {
    return { fontSize: variant.fontSize, lineHeight: variant.lineHeight };
  }
  return {
    fontSize: Math.round(variant.fontSize * COMPACT_FACTOR),
    lineHeight: variant.lineHeight ? Math.round(variant.lineHeight * COMPACT_FACTOR) : undefined,
  };
}
