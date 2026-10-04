import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { AppErrorScreen } from '@/components/app-error-screen';
import { ErrorState } from '@/components/states';
import {
  AccountStatusProvider,
  useAccountStatus,
  useRetryAccountStatus,
} from '@/features/auth/account-status-provider';
import { useUpdateNeed } from '@/features/distribution/api/app-release';
import { UpdateRequired } from '@/features/distribution/components/update-prompts';
import { isDevelopment } from '@/lib/env';
import { queryClient } from '@/lib/query-client';
import { getInstallContext } from '@/services/install-context';
import { registerServiceWorker } from '@/services/pwa';
import { useFontsReady, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 200 });
registerServiceWorker();

/** `/download` and `/install` belong to the website (web build) only (DECISIONS D-038). */
const IS_WEBSITE = getInstallContext() !== 'native-app';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AppErrorScreen error={error} onRetry={retry} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <AccountStatusProvider>
            <RootNavigator />
          </AccountStatusProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const status = useAccountStatus();
  const retryStatus = useRetryAccountStatus();
  const { colors, scheme } = useTheme();
  // Always true natively (fonts are embedded); on the web, true once they are registered.
  const fontsReady = useFontsReady();
  const ready = fontsReady && status !== 'loading';
  // An APK older than the oldest supported build stops here (D-039; Android only).
  const update = useUpdateNeed(
    status === 'eligible' || status === 'onboarding' || status === 'restricted',
  );

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    // The splash stays visible until the account status (and, on the web, the fonts) are known.
    return null;
  }

  // Every screen, including the two full-screen states below, sets the status bar.
  const statusBar = <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;

  if (status === 'unavailable') {
    return (
      <>
        {statusBar}
        <ErrorState
          title="Can't reach SOUL"
          body="Check your connection and try again."
          onRetry={retryStatus}
        />
      </>
    );
  }

  if (update.need === 'required' && update.release) {
    return (
      <>
        {statusBar}
        <UpdateRequired release={update.release} />
      </>
    );
  }

  const pageHeader = {
    headerShown: true,
    headerTitle: '',
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.textPrimary,
  };

  return (
    <>
      {statusBar}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Protected guard={status === 'signed-out'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'onboarding'}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'eligible'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        {/* Suspended, banned or being deleted: the restricted screen (D-053). */}
        <Stack.Protected guard={status === 'restricted'}>
          <Stack.Screen name="(restricted)" />
        </Stack.Protected>
        {/* Rules, Terms and Privacy are readable before and after sign-in. */}
        <Stack.Screen name="legal/[doc]" options={pageHeader} />
        {/* Website pages: open to everyone, signed in or not. */}
        <Stack.Protected guard={IS_WEBSITE}>
          <Stack.Screen name="download" options={pageHeader} />
          <Stack.Screen name="install" options={pageHeader} />
        </Stack.Protected>
        {/* Internal design-system preview: development builds only, never production. */}
        <Stack.Protected guard={isDevelopment && __DEV__}>
          <Stack.Screen name="design-system" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
