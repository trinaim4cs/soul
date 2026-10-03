import * as Location from 'expo-location';

import type { HeadingService } from './types';

export type { HeadingAvailability, HeadingService } from './types';

/**
 * Device heading from expo-location: true north when location permission is granted (Instant
 * Meet always has it), magnetic north otherwise. A phone without a compass never reports, and
 * the compass view says so instead of guessing.
 */
export const heading: HeadingService = {
  async availability() {
    return 'available';
  },
  async requestPermission() {
    return 'available';
  },
  watch(onHeading) {
    let stopped = false;
    let subscription: Location.LocationSubscription | null = null;
    Location.watchHeadingAsync((reading) => {
      const degrees = reading.trueHeading >= 0 ? reading.trueHeading : reading.magHeading;
      if (Number.isFinite(degrees) && degrees >= 0) onHeading(degrees % 360);
    })
      .then((created) => {
        if (stopped) created.remove();
        else subscription = created;
      })
      .catch(() => {});
    return () => {
      stopped = true;
      subscription?.remove();
    };
  },
};
