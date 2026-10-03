import * as Location from 'expo-location';
import { Linking } from 'react-native';

import type { LocationPermission, LocationService } from './types';

export type { LocationFix, LocationPermission, LocationService } from './types';

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
  watch(onFix, onError) {
    let stopped = false;
    let subscription: Location.LocationSubscription | null = null;
    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
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
