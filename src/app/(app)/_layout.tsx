import { Stack } from 'expo-router';
import { View } from 'react-native';

import { OfflineNotice } from '@/components/offline-notice';
import { useAccountRealtime } from '@/features/chat/hooks/use-account-realtime';
import { useInstantPresence } from '@/features/instant/hooks/use-instant-presence';
import { usePush } from '@/features/notifications/hooks/use-push';
import { fontFamily, radii, useTheme } from '@/theme';

/**
 * Tabs at the root; profile and settings screens push over them with a plain back header.
 * Filters is a sheet, the paywall a modal with its own close button, and the match reveal a
 * full-screen fade onto the black brand surface. A live Instant Meet session has its own
 * screen (compass) and chat, both pushed over the tabs.
 */
export default function AppLayout() {
  const { colors } = useTheme();
  useAccountRealtime();
  useInstantPresence();
  usePush();
  const pageHeader = {
    headerShown: true,
    headerTitle: '',
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.textPrimary,
    headerTitleStyle: { fontFamily: fontFamily.body },
  };
  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile/edit" options={pageHeader} />
        <Stack.Screen name="profile/[id]" options={pageHeader} />
        <Stack.Screen
          name="filters"
          options={{
            ...pageHeader,
            presentation: 'formSheet',
            sheetAllowedDetents: [0.92],
            sheetGrabberVisible: true,
            sheetCornerRadius: radii.xl,
          }}
        />
        <Stack.Screen
          name="date/[id]"
          options={{
            ...pageHeader,
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6],
            sheetGrabberVisible: true,
            sheetCornerRadius: radii.xl,
          }}
        />
        <Stack.Screen
          name="safety/[id]"
          options={{
            ...pageHeader,
            presentation: 'formSheet',
            sheetAllowedDetents: [0.55],
            sheetGrabberVisible: true,
            sheetCornerRadius: radii.xl,
          }}
        />
        <Stack.Screen name="report/[id]" options={pageHeader} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="pay/return" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="pay/mock" options={{ headerShown: false }} />
        <Stack.Screen
          name="match/[id]"
          options={{
            presentation: 'fullScreenModal',
            animation: 'fade',
            headerShown: false,
            contentStyle: { backgroundColor: colors.moment },
          }}
        />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="instant/session/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="instant/chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="settings/index" options={pageHeader} />
        <Stack.Screen name="settings/privacy" options={pageHeader} />
        <Stack.Screen name="settings/notifications" options={pageHeader} />
        <Stack.Screen name="settings/purchases" options={pageHeader} />
        <Stack.Screen name="settings/blocked" options={pageHeader} />
        <Stack.Screen name="settings/delete" options={pageHeader} />
      </Stack>
      <OfflineNotice />
    </View>
  );
}
