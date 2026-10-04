import * as Location from 'expo-location';
import { Linking } from 'react-native';

import type { LocationPermission, LocationService, WatchMode } from './types';

export type { LocationFix, LocationPermission, LocationService, WatchMode } from './types';

/** Time between fixes: often enough during a meet, sparing while only searching. */
export const FIX_INTERVAL_MS: Record<WatchMode, number> = { search: 20_000, session: 5_000 };

function toPermission(response: Location.LocationPermissionResponse): LocationPermission {
  if (response.granted) return 'granted';
  return response.status === Location.PermissionStatus.UNDETERMINED ? 'undetermined' : 'denied';
}

/**
 * Foreground location with expo-location (Instant Meet only, DECISIONS D-030, D-050). No
 * background permission is ever requested; the watch runs only while Instant is on and the
 * app is in the foreground.
 */
export const location: LocationService = {
  async getPermission() {
    return toPermission(await Location.getForegroundPermissionsAsync());
  },
  async requestPermission() {
    return toPermission(await Location.requestForegroundPermissionsAsync());
  },
  settingsHint: 'Allow location for SOUL in Settings, then try again.',
  openSettings() {
    void Linking.openSettings().catch(() => {});
  },
  watch(onFix, onError, mode) {
    let stopped = false;
    let subscription: Location.LocationSubscription | null = null;
    Location.watchPositionAsync(
      {
        // High accuracy in both modes: a coarse fix can exceed the server's 200 m limit
        // indoors. Battery is saved by asking less often while searching, and no distance
        // filter, so a person standing still still refreshes before their fix goes stale.
        accuracy: Location.Accuracy.High,
        timeInterval: FIX_INTERVAL_MS[mode],
        distanceInterval: 0,
        // Never Google's "Location Accuracy" consent dialog: if location is off, the Instant
        // tab says so in SOUL's own words and links to settings.
        mayShowUserSettingsDialog: false,
      },
      (position) => {
        onFix({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? Number.POSITIVE_INFINITY,
          timestamp: position.timestamp,
        });
      },
      () => onError('unavailable'),
    )
      .then((created) => {
        if (stopped) created.remove();
        else subscription = created;
      })
      .catch(async () => {
        const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
        onError(permission && !permission.granted ? 'denied' : 'unavailable');
      });
    return () => {
      stopped = true;
      subscription?.remove();
    };
  },
};
