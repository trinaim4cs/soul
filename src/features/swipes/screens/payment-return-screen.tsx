import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulIcon, type IconName } from '@/components/soul-icon';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { LoadingState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { refreshPayments, syncPayments, usePayment } from '@/features/swipes/api/payments';
import { refreshSwipes, usePlans } from '@/features/swipes/api/swipes';
import { likesLabel } from '@/features/swipes/model/swipes';
import { createThemedStyles, spacing } from '@/theme';

/** Ask the provider directly after this long without a webhook. */
const SYNC_AFTER_MS = 6_000;
/** Then stop saying "a moment" and explain it may take longer. */
const SLOW_AFTER_MS = 45_000;

function home() {
  router.dismissAll();
  router.replace('/');
}

/**
 * Back from checkout (DECISIONS D-052). Coming back proves nothing: this screen only asks the
 * server what happened to the order, and shows it. A payment counts once the provider's
 * signed webhook (or the server's own check with the provider) says so.
 */
export function PaymentReturnScreen({ orderId }: { orderId: string }) {
  const styles = useStyles();
  const userId = useCurrentUserId();
  const payment = usePayment(orderId);
  const plans = usePlans();
  const [slow, setSlow] = useState(false);
  const [checking, setChecking] = useState(false);
  const status = payment.data?.status;
  const celebrated = useRef(false);

  useEffect(() => {
    if (status !== 'created') return;
    const sync = setTimeout(() => void syncPayments(orderId).catch(() => {}), SYNC_AFTER_MS);
    const later = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      clearTimeout(sync);
      clearTimeout(later);
    };
  }, [status, orderId]);

  useEffect(() => {
    if (status !== 'paid' || !userId || celebrated.current) return;
    celebrated.current = true;
    void refreshSwipes(userId);
    void refreshPayments();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [status, userId]);

  async function checkAgain() {
    setChecking(true);
    try {
      await syncPayments(orderId);
    } catch {
      // The next poll tries again.
    } finally {
      await payment.refetch();
      setChecking(false);
    }
  }

  if (payment.isPending) return <LoadingState />;
  const data = payment.data;
  const plan = plans.data?.find((item) => item.id === data?.plan_id);

  let icon: IconName = 'hourglass_empty';
  let title = 'Confirming your payment';
  let body = slow
    ? 'This is taking longer than usual. If you paid, your likes appear as soon as the payment is confirmed; you can leave this screen.'
    : 'This takes a moment. Please keep SOUL open.';
  let primary = { label: 'Back to SOUL', onPress: home };
  let secondary: { label: string; onPress: () => void } | null = slow
    ? { label: checking ? 'Checking…' : 'Check again', onPress: () => void checkAgain() }
    : null;

  if (!data) {
    icon = 'info';
    title = "We couldn't find this payment";
    body = 'If you were charged, it shows up in Settings → Purchases within a few minutes.';
    secondary = null;
  } else if (data.status === 'paid') {
    icon = 'check';
    title =
      plan?.kind === 'topup'
        ? `${likesLabel(plan.right_swipes)} added`
        : `${data.title ?? 'Your plan'} is on`;
    body =
      plan?.kind === 'subscription'
        ? `${likesLabel(plan.right_swipes)} for ${plan.period_label ?? 'the period'}${plan.includes_instant ? ', and Instant Meet' : ''}.`
        : 'They never expire.';
    secondary = null;
  } else if (data.status === 'refunded') {
    icon = 'info';
    title = 'This payment was refunded';
    body = 'What it added has been removed.';
    secondary = null;
  } else if (data.status === 'rejected') {
    icon = 'error';
    title = "This payment couldn't be accepted";
    body = 'Something about it did not match the order. If you were charged, it will be refunded.';
    secondary = null;
  } else if (data.status !== 'created') {
    icon = 'info';
    title = "This payment wasn't completed";
    body = 'Nothing was charged.';
    primary = { label: 'See plans', onPress: () => router.replace('/paywall') };
    secondary = { label: 'Back to SOUL', onPress: home };
  }

  return (
    <SoulScreen
      footer={
        <View style={styles.footer}>
          <SoulButton label={primary.label} onPress={primary.onPress} block />
          {secondary ? (
            <SoulButton
              label={secondary.label}
              variant="ghost"
              onPress={secondary.onPress}
              disabled={checking}
              block
            />
          ) : null}
        </View>
      }>
      <View style={styles.body} accessibilityLiveRegion="polite">
        <SoulIcon name={icon} size="lg" />
        <SoulText variant="section" italic accessibilityRole="header" style={styles.stretch}>
          {title}
        </SoulText>
        <SoulText variant="body" tone="secondary" style={styles.stretch}>
          {body}
        </SoulText>
      </View>
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(() =>
  StyleSheet.create({
    body: { flex: 1, justifyContent: 'center', gap: spacing.md },
    // Full width: shrink-wrapped serif text can lose its last word on Android.
    stretch: { alignSelf: 'stretch' },
    footer: { gap: spacing.xs },
  }),
);
