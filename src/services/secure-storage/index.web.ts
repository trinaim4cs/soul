import type { SecureStorage } from './types';

export type { SecureStorage } from './types';

/**
 * Web (iPhone PWA): browsers have no keystore, so the session lives in localStorage
 * (DECISIONS D-040). The protections are a strict CSP, no third-party scripts and
 * short-lived access tokens (SECURITY_MODEL section 12). Storage can be unavailable (for
 * example with some privacy settings); the app then behaves as signed out.
 */
function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const secureStorage: SecureStorage = {
  getItem: async (key) => {
    try {
      return store()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      store()?.setItem(key, value);
    } catch {
      // Quota or privacy mode: the session simply is not remembered.
    }
  },
  removeItem: async (key) => {
    try {
      store()?.removeItem(key);
    } catch {
      // Nothing to remove.
    }
  },
};
