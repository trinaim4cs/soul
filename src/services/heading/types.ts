/**
 * Compass heading contract (Instant Meet, spec amendment). Implemented in Phase 10:
 * `index.ts` with the device heading, `index.web.ts` with DeviceOrientationEvent
 * (`webkitCompassHeading` on iOS, which needs a permission prompt from a user action).
 * When heading is `unavailable`, Instant shows "Direction unavailable on this device" and keeps
 * distance, chat, timer and End Meet. It never guesses a direction.
 */
export type HeadingAvailability = 'available' | 'needs-permission' | 'unavailable';

export type HeadingService = {
  availability(): Promise<HeadingAvailability>;
  /** Must be called from a user action on iOS Safari. */
  requestPermission(): Promise<HeadingAvailability>;
  /** Degrees from true north (0 to 360), damped by the caller; returns an unsubscribe function. */
  watch(onHeading: (degrees: number) => void): () => void;
};
