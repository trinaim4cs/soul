import { Stack } from 'expo-router';

import { useRestrictedRealtime } from '@/features/safety/hooks/use-restricted-realtime';

export default function RestrictedLayout() {
  useRestrictedRealtime();
  return <Stack screenOptions={{ headerShown: false }} />;
}
