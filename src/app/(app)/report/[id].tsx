import { useLocalSearchParams } from 'expo-router';

import type { SafetyContext } from '@/features/safety/model/safety';
import { ReportScreen } from '@/features/safety/screens/report-screen';

const CONTEXTS: SafetyContext[] = ['chat', 'profile', 'instant', 'discovery'];

export default function ReportRoute() {
  const { id, name, context } = useLocalSearchParams<{
    id: string;
    name?: string;
    context?: string;
  }>();
  const safeContext = CONTEXTS.find((item) => item === context) ?? 'profile';
  return <ReportScreen personId={id} name={name || 'this person'} context={safeContext} />;
}
