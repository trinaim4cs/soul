import { Stack } from 'expo-router';

import { fontFamily, useTheme } from '@/theme';

/** Tabs at the root; profile and settings screens push over them with a plain back header. */
export default function AppLayout() {
  const { colors } = useTheme();
  const pageHeader = {
    headerShown: true,
    headerTitle: '',
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.textPrimary,
    headerTitleStyle: { fontFamily: fontFamily.body },
  };
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="profile/edit" options={pageHeader} />
      <Stack.Screen name="settings/index" options={pageHeader} />
      <Stack.Screen name="settings/privacy" options={pageHeader} />
    </Stack>
  );
}
