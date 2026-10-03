import type { HeadingAvailability, HeadingService } from './types';

export type { HeadingAvailability, HeadingService } from './types';

type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };
type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const orientation = (): OrientationConstructor | null =>
  typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
    ? (window.DeviceOrientationEvent as OrientationConstructor)
    : null;

let granted = false;

/**
 * Compass heading in the browser. iPhone Safari reports `webkitCompassHeading` after a
 * permission prompt that must come from a tap; Android Chrome reports an absolute `alpha`.
 * A desktop browser has no compass and never reports.
 */
export const heading: HeadingService = {
  async availability(): Promise<HeadingAvailability> {
    const api = orientation();
    if (!api) return 'unavailable';
    if (typeof api.requestPermission === 'function' && !granted) return 'needs-permission';
    return 'available';
  },
  async requestPermission(): Promise<HeadingAvailability> {
    const api = orientation();
    if (!api) return 'unavailable';
    if (typeof api.requestPermission !== 'function') return 'available';
    try {
      granted = (await api.requestPermission()) === 'granted';
    } catch {
      granted = false;
    }
    return granted ? 'available' : 'unavailable';
  },
  watch(onHeading) {
    if (!orientation()) return () => {};
    const onCompass = (event: DeviceOrientationEvent) => {
      const compass = (event as OrientationEventWithCompass).webkitCompassHeading;
      if (typeof compass === 'number' && compass >= 0) onHeading(compass % 360);
    };
    // `alpha` grows counter-clockwise from north; a heading grows clockwise.
    const onAbsolute = (event: Event) => {
      const { absolute, alpha } = event as DeviceOrientationEvent;
      if (absolute && typeof alpha === 'number') onHeading((360 - alpha) % 360);
    };
    window.addEventListener('deviceorientation', onCompass);
    window.addEventListener('deviceorientationabsolute', onAbsolute);
    return () => {
      window.removeEventListener('deviceorientation', onCompass);
      window.removeEventListener('deviceorientationabsolute', onAbsolute);
    };
  },
};
