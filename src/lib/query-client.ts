import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { addNetworkStateListener } from 'expo-network';
import { AppState, Platform, type AppStateStatus } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
    mutations: {
      // Server-authoritative writes must never be silently replayed by the client, nor held
      // while offline to run later.
      retry: false,
      networkMode: 'always',
    },
  },
});

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

AppState.addEventListener('change', onAppStateChange);

// Offline on a phone: reads pause instead of failing through their retries, and resume (with
// a refetch of what went stale) once the connection is back (Phase 19). Browsers already tell
// React Query through their online and offline events.
if (Platform.OS !== 'web') {
  onlineManager.setEventListener((setOnline) => {
    const subscription = addNetworkStateListener((state) => setOnline(state.isConnected !== false));
    return () => subscription.remove();
  });
}
