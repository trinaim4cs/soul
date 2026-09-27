/**
 * 4-point spacing scale. SOUL is spacious (VISUAL_DENSITY 2): prefer the larger steps.
 * Steps are named by size; the semantic aliases below are the defaults screens use.
 */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 56,
  huge: 80,
} as const;

export const layout = {
  /** Horizontal screen gutter, applied everywhere. */
  screenGutter: spacing.lg,
  /** Between major sections of a screen. */
  sectionGap: spacing.xxl,
  /** Between related elements in a stack. */
  stackGap: spacing.md,
  /** Between tightly coupled elements (label and input). */
  tightGap: spacing.xs,
  /** Comfortable measure for reading text. */
  maxTextWidth: 560,
} as const;

export type SpacingToken = keyof typeof spacing;
