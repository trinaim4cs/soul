import { useLocalSearchParams } from 'expo-router';

import { SessionScreen } from '@/features/instant/screens/session-screen';

export default function InstantSessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionScreen id={id} />;
}
