/** Component and icon sizes. Android touch targets never go below 48 dp. */
export const sizes = {
  touchTarget: 48,
  button: { lg: 56, md: 48, sm: 40 },
  input: 56,
  listRow: 64,
  composerMin: 48,
  avatar: { xs: 32, sm: 44, md: 56, lg: 96 },
  badge: 24,
  /** Portrait photo ratio used for profile photography (width / height). */
  photoAspect: 4 / 5,
  /** Extra softening on the tiny anonymous-mode copies (they are 24 px wide already). */
  anonymousBlur: 16,
  /** Largest diameter of the Instant Meet compass. */
  compassMax: 300,
} as const;

/** Material Symbols sizes (single icon family, DECISIONS D-005 / Phase 2). */
export const iconSizes = {
  sm: 18,
  md: 22,
  lg: 28,
  xl: 36,
  /** The Instant Meet compass arrow, the one oversized glyph. */
  compass: 96,
} as const;

export type IconSize = keyof typeof iconSizes;
