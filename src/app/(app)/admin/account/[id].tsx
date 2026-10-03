import { useLocalSearchParams } from 'expo-router';

import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { useAdminRole } from '@/features/admin/api/admin';
import { AdminAccountScreen } from '@/features/admin/screens/admin-account-screen';

export default function AdminAccountRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const role = useAdminRole(useCurrentUserId()).data;
  return role ? <AdminAccountScreen id={id} role={role} /> : null;
}
