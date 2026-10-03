import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { useAdminRole } from '@/features/admin/api/admin';
import { AdminHomeScreen } from '@/features/admin/screens/admin-home-screen';

export default function AdminRoute() {
  const role = useAdminRole(useCurrentUserId()).data;
  return role ? <AdminHomeScreen role={role} /> : null;
}
