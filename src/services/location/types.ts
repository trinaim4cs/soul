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

/**
 * How often the device is asked for a position (Phase 19, battery). Searching only needs to
 * stay inside the server's 90 s freshness window on a ~110 m grid; a live meet needs the
 * distance and arrow to follow the person.
 */
export type WatchMode = 'search' | 'session';

export type LocationService = {
  getPermission(): Promise<LocationPermission>;
  /** Must be called from a user action (web browsers require it). */
  requestPermission(): Promise<LocationPermission>;
  /** Where to turn location back on after a refusal, in the platform's own words. */
  settingsHint: string;
  /** Opens the app's system settings; absent where a page cannot do that (the web). */
  openSettings?: () => void;
  /** Foreground updates while Instant Meet is on; returns an unsubscribe function. */
  watch(
    onFix: (fix: LocationFix) => void,
    onError: (reason: 'denied' | 'unavailable') => void,
    mode: WatchMode,
  ): () => void;
};
