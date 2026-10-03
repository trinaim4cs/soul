import { useLocalSearchParams } from 'expo-router';

import { MockCheckoutScreen } from '@/features/swipes/screens/mock-checkout-screen';

export default function MockCheckoutRoute() {
  const { order } = useLocalSearchParams<{ order: string }>();
  return <MockCheckoutScreen orderId={order} />;
}
