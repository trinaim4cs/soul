import { useLocalSearchParams } from 'expo-router';

import { DateSheet } from '@/features/dates/screens/date-sheet';

export default function DateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DateSheet otherId={id} />;
}
