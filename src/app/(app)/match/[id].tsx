import { useLocalSearchParams } from 'expo-router';

import { MatchRevealScreen } from '@/features/matching/screens/match-reveal-screen';

export default function MatchRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MatchRevealScreen id={id} />;
}
