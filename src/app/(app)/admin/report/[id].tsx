import { useLocalSearchParams } from 'expo-router';

import { AdminReportScreen } from '@/features/admin/screens/admin-report-screen';

export default function AdminReportRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AdminReportScreen id={id} />;
}
