import { useLocalSearchParams } from 'expo-router';

import { SoulScreen } from '@/components/soul-screen';
import { EmptyState } from '@/components/states';
import { PaymentReturnScreen } from '@/features/swipes/screens/payment-return-screen';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Back from checkout. Any other query parameters (the provider adds some) are ignored. */
export default function PaymentReturnRoute() {
  const { order } = useLocalSearchParams<{ order?: string }>();
  if (!order || !UUID.test(order)) {
    return (
      <SoulScreen>
        <EmptyState
          icon="info"
          title="We couldn't find this payment"
          body="Open Settings → Purchases."
        />
      </SoulScreen>
    );
  }
  return <PaymentReturnScreen orderId={order} />;
}
