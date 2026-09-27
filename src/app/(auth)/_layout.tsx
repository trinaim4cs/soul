import { Stack } from 'expo-router';

import { fontFamily, useTheme } from '@/theme';

export const unstable_settings = { initialRouteName: 'welcome' };

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: '',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontFamily: fontFamily.body },
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="rules" />
      <Stack.Screen name="email" />
      <Stack.Screen name="verify" />
    </Stack>
  );
}
