import { cubicBezier, Easing } from 'react-native-reanimated';

/**
 * SOUL motion tokens (MOBILE-DESIGN.md motion principles; MOTION_SYSTEM.md).
 *
 * Fast, damped, physical, interruptible. Anything a finger drives uses a spring that
 * carries release velocity; everything else uses timing with a strong ease-out.
 * Never ease-in on UI. Tabs never slide. Overshoot only after a momentum gesture.
 * Values follow the `expo-animation` skill tables (Reanimated 4.5.1).
 */
export const durations = {
  /** Press feedback (touched dozens of times a day: near-imperceptible). */
  press: 120,
  /** Toggles, chips, small state changes. */
  small: 180,
  /** Element enters and exits (profile content, typing indicator, toast). */
  base: 240,
  /** Rare, larger moments (match reveal). */
  reveal: 360,
} as const;

/** `withTiming` / layout-animation easings. */
export const easings = {
  /** Default for entering, exiting and anything without a finger on it. */
  out: Easing.bezier(0.23, 1, 0.32, 1),
  /** On-screen movement and morphs. */
  inOut: Easing.bezier(0.77, 0, 0.175, 1),
  /** Sheets. */
  sheet: Easing.bezier(0.32, 0.72, 0, 1),
  /** Constant motion only (progress, shimmer). */
  linear: Easing.linear,
} as const;

/** Reanimated CSS-transition timing functions (strings are rejected in 4.5.1). */
export const cssEasings = {
  out: cubicBezier(0.23, 1, 0.32, 1),
  inOut: cubicBezier(0.77, 0, 0.175, 1),
} as const;

type SpringTokens = { duration: number; dampingRatio: number; overshootClamping?: boolean };

/**
 * Springs in the designer form (duration + dampingRatio). Pass the gesture's `velocity`
 * alongside when releasing a drag so motion continues instead of restarting.
 */
export const springs = {
  /** Default settle with no overshoot. */
  settle: { duration: 400, dampingRatio: 1 },
  /** Snap back or fly out after a drag (swipe card). Slight give only with momentum. */
  release: { duration: 400, dampingRatio: 0.8 },
  /** Bottom sheets and floating composer. */
  sheet: { duration: 300, dampingRatio: 0.8 },
  /** Must never pass an edge (sheet top, card bounds). */
  clamped: { duration: 300, dampingRatio: 1, overshootClamping: true },
  /** Instant compass needle: slow, fully damped interpolation of bearing changes. */
  compass: { duration: 700, dampingRatio: 1 },
} as const satisfies Record<string, SpringTokens>;

export const pressFeedback = {
  scale: 0.97,
} as const;

/** Short translations only: transitions move 8 to 16 dp, never full-screen slides. */
export const travel = {
  small: 8,
  medium: 16,
} as const;
