import * as SecureStore from 'expo-secure-store';

import type { SecureStorage } from './types';

export type { SecureStorage } from './types';

/**
 * Native: the Android Keystore-backed SecureStore (DECISIONS D-006). Android enforces no
 * value-size limit; a future native iOS build needs a chunked adapter, because older iOS
 * releases reject Keychain values above ~2 KB.
 */
export const secureStorage: SecureStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
