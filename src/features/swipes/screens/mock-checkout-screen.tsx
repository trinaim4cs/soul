import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { EmptyState, LoadingState } from '@/components/states';
import { isDevelopment } from '@/lib/env';
import { mockPayment, usePayment } from '@/features/swipes/api/payments';
import { paymentLine } from '@/features/swipes/model/payments';
import { createThemedStyles, spacing } from '@/theme';

/**
 * Development builds only (DECISIONS D-052): stands in for Razorpay's page when the local
 * server uses the mock provider. "Pay" makes the server send itself a signed provider event,
 * so the real verification and granting run. Production builds never show this, and a
 * production server refuses mock orders and the mock function outright.
 */
export function MockCheckoutScreen({ orderId }: { orderId: string }) {
  const styles = useStyles();
  const payment = usePayment(isDevelopment ? orderId : null);
  const [busy, setBusy] = useState<'paid' | 'expire' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isDevelopment) {
    return (
      <SoulScreen>
        <EmptyState
          icon="info"
          title="Not available"
          body="This page exists only in test builds."
        />
      </SoulScreen>
    );
  }
  if (payment.isPending) return <LoadingState />;
  if (!payment.data) {
    return (
      <SoulScreen>
        <EmptyState icon="info" title="No such order" body="Start again from the plans screen." />
      </SoulScreen>
    );
  }

  async function finish(outcome: 'paid' | 'expire') {
    setBusy(outcome);
    setError(null);
    try {
      await mockPayment(orderId, outcome);
      router.replace({ pathname: '/pay/return', params: { order: orderId } });
    } catch {
      setError("The test provider didn't answer. Is the local stack running?");
      setBusy(null);
    }
  }

  return (
    <SoulScreen
      footer={
        <View style={styles.footer}>
          {error ? (
            <SoulText variant="supporting" align="center" role="alert">
              {error}
            </SoulText>
          ) : null}
          <SoulButton
            label="Pay (test)"
            onPress={() => void finish('paid')}
            loading={busy === 'paid'}
            disabled={busy !== null}
            block
          />
          <SoulButton
            label="Let it expire (test)"
            variant="secondary"
            onPress={() => void finish('expire')}
            loading={busy === 'expire'}
            disabled={busy !== null}
            block
          />
          <SoulButton label="Cancel" variant="ghost" onPress={() => router.back()} block />
        </View>
      }>
      <View style={styles.body}>
        <SoulText variant="micro" tone="tertiary">
          TEST CHECKOUT · DEVELOPMENT BUILD
        </SoulText>
        <SoulText variant="section" accessibilityRole="header">
          {paymentLine(payment.data)}
        </SoulText>
        <SoulText variant="body" tone="secondary">
          No money moves. This stands in for Razorpay while SOUL runs on a local server.
        </SoulText>
      </View>
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(() =>
  StyleSheet.create({
    body: { gap: spacing.md, paddingTop: spacing.xl },
    footer: { gap: spacing.xs },
  }),
);
