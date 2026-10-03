import { Redirect, Stack } from 'expo-router';

import { LoadingState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { useAdminRole } from '@/features/admin/api/admin';
import { fontFamily, useTheme } from '@/theme';

/**
 * Admin (D-055). Only people the server lists in `admin_roles` get past this screen, and every
 * action behind it is checked again by the server: the route itself grants nothing.
 */
export default function AdminLayout() {
  const { colors } = useTheme();
  const role = useAdminRole(useCurrentUserId());
  if (role.isPending) return <LoadingState />;
  if (!role.data) return <Redirect href="/" />;
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
      }}
    />
  );
}
