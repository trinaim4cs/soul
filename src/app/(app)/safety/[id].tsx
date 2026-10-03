import { useLocalSearchParams } from 'expo-router';

import type { SafetyContext } from '@/features/safety/model/safety';
import { SafetySheet } from '@/features/safety/screens/safety-sheet';

const CONTEXTS: SafetyContext[] = ['chat', 'profile', 'instant', 'discovery'];

export default function SafetyRoute() {
  const { id, name, context, match } = useLocalSearchParams<{
    id: string;
    name?: string;
    context?: string;
    match?: string;
  }>();
  const safeContext = CONTEXTS.find((item) => item === context) ?? 'profile';
  return (
    <SafetySheet
      personId={id}
      name={name || 'this person'}
      context={safeContext}
      matchId={match || null}
    />
  );
}
