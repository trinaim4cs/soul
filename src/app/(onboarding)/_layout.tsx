import { Stack } from 'expo-router';

import { useServerStatusData } from '@/features/auth/account-status-provider';
import { useTheme } from '@/theme';

/**
 * Onboarding steps are guarded by the server's step flags (get_my_status), so the server,
 * not the client, decides which step comes next.
 */
export default function OnboardingLayout() {
  const { colors } = useTheme();
  const server = useServerStatusData();
  const steps = server?.steps;
  const ageLocked = server?.age_locked ?? false;
  const termsDone = Boolean(steps?.terms);

  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!termsDone}>
        <Stack.Screen name="terms" />
      </Stack.Protected>
      <Stack.Protected guard={termsDone && ageLocked}>
        <Stack.Screen name="age-locked" />
      </Stack.Protected>
      <Stack.Protected guard={termsDone && !ageLocked && !steps?.age}>
        <Stack.Screen name="birthday" />
      </Stack.Protected>
      <Stack.Protected guard={termsDone && Boolean(steps?.age) && !steps?.profile}>
        <Stack.Screen name="profile-setup" />
      </Stack.Protected>
    </Stack>
  );
}
