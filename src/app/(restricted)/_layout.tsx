import { Stack } from 'expo-router';

export default function RestrictedLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
