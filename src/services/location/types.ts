/**
 * Location contract (Instant Meet only, DECISIONS D-030, D-031). Implemented in Phase 10:
 * `index.ts` with expo-location (foreground only), `index.web.ts` with navigator.geolocation.
 * Fixes go only to the server; the app never receives another user's coordinates.
 */
export type LocationPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export type LocationFix = {
  latitude: number;
  longitude: number;
  /** Metres, as reported by the device. */
  accuracy: number;
  timestamp: number;
};

export type LocationService = {
  getPermission(): Promise<LocationPermission>;
  /** Must be called from a user action (web browsers require it). */
  requestPermission(): Promise<LocationPermission>;
  /** Foreground updates while Instant Meet is on; returns an unsubscribe function. */
  watch(
    onFix: (fix: LocationFix) => void,
    onError: (reason: 'denied' | 'unavailable') => void,
  ): () => void;
};
