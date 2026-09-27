import { useLocalSearchParams } from 'expo-router';

import { CardDetailScreen } from '@/features/discovery/screens/card-detail-screen';

export default function ProfileCardRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CardDetailScreen id={id} />;
}
