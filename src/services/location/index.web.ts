import type { LocationFix, LocationPermission, LocationService } from './types';

export type { LocationFix, LocationPermission, LocationService } from './types';

const supported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;

async function queryPermission(): Promise<LocationPermission> {
  if (!supported()) return 'unavailable';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    if (status.state === 'granted') return 'granted';
    return status.state === 'denied' ? 'denied' : 'undetermined';
  } catch {
    // Older Safari has no Permissions API: asking is the only way to know.
    return 'undetermined';
  }
}

function toFix(position: GeolocationPosition): LocationFix {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
  };
}

/**
 * Browser geolocation for the iPhone PWA (DECISIONS D-035, D-050). Used only while Instant
 * is on and the page is visible; nothing is stored in the browser.
 */
export const location: LocationService = {
  getPermission: queryPermission,
  settingsHint: 'Allow location for this site in your browser settings, then try again.',
  requestPermission() {
    if (!supported()) return Promise.resolve('unavailable');
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve('granted'),
        // A timeout still means the person allowed it; the watch keeps trying.
        (error) => resolve(error.code === error.PERMISSION_DENIED ? 'denied' : 'granted'),
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
      );
    });
  },
  watch(onFix, onError) {
    if (!supported()) {
      onError('unavailable');
      return () => {};
    }
    const fail = (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) onError('denied');
      // A timeout is temporary: the watch keeps trying.
      else if (error.code === error.POSITION_UNAVAILABLE) onError('unavailable');
    };
    const options = { enableHighAccuracy: true, timeout: 30_000, maximumAge: 5_000 };
    const id = navigator.geolocation.watchPosition(
      (position) => onFix(toFix(position)),
      fail,
      options,
    );
    // Browsers report only when the position changes. A device standing still still needs a
    // fresh fix now and then, or the server stops using it.
    const heartbeat = setInterval(() => {
      navigator.geolocation.getCurrentPosition((position) => onFix(toFix(position)), fail, options);
    }, 30_000);
    return () => {
      navigator.geolocation.clearWatch(id);
      clearInterval(heartbeat);
    };
  },
};
