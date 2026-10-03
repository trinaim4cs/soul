import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { refreshPayments, syncPayments, useMyPayments } from '@/features/swipes/api/payments';
import { refreshSwipes } from '@/features/swipes/api/swipes';
import { paymentLine, paymentStatusLabel } from '@/features/swipes/model/payments';
import { shortDate } from '@/features/swipes/model/swipes';
import { createThemedStyles, radii, spacing } from '@/theme';

/**
 * Settings → Purchases (spec 66: restore, entitlement synchronization). The history comes
 * from the server; "Check for missed payments" asks the server to confirm any unpaid order
 * with the provider directly, then re-reads likes and plans.
 */
export function PurchasesScreen() {
  const styles = useStyles();
  const userId = useCurrentUserId();
  const payments = useMyPayments(userId);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function restore() {
    if (!userId) return;
    setChecking(true);
    setNotice(null);
    try {
      await syncPayments();
      await Promise.all([refreshPayments(), refreshSwipes(userId)]);
      setNotice('Your purchases are up to date.');
    } catch {
      setNotice("Couldn't check right now. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  if (payments.isPending) return <LoadingState />;
  if (payments.isError) {
    return (
      <ErrorState
        title="Couldn't load your purchases"
        body="Check your connection and try again."
        onRetry={() => void payments.refetch()}
      />
    );
  }

  return (
    <SoulScreen
      scroll
      edges={{ top: false, bottom: true }}
      footer={
        <View style={styles.footer}>
          {notice ? (
            <SoulText variant="supporting" align="center" role="status">
              {notice}
            </SoulText>
          ) : null}
          <SoulButton
            label="Check for missed payments"
            variant="secondary"
            onPress={() => void restore()}
            loading={checking}
            block
          />
        </View>
      }>
      <SoulText variant="title" accessibilityRole="header">
        Purchases
      </SoulText>
      {payments.data.length === 0 ? (
        <EmptyState
          icon="info"
          title="No purchases yet"
          body="Plans and top-ups you buy show up here."
        />
      ) : (
        <View style={styles.list}>
          {payments.data.map((payment) => (
            <View
              key={payment.id}
              style={styles.row}
              accessible
              accessibilityLabel={`${paymentLine(payment)}, ${shortDate(payment.created_at)}, ${paymentStatusLabel(payment.status)}`}>
              <View style={styles.rowText}>
                <SoulText variant="label">{paymentLine(payment)}</SoulText>
                <SoulText variant="supporting" tone="tertiary">
                  {shortDate(payment.created_at)}
                </SoulText>
              </View>
              <SoulText variant="supporting" tone="secondary">
                {paymentStatusLabel(payment.status)}
              </SoulText>
            </View>
          ))}
        </View>
      )}
      <SoulText variant="caption" tone="tertiary" style={styles.note}>
        Payments are handled by Razorpay. SOUL never sees your card or UPI details.
      </SoulText>
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    list: { marginTop: spacing.lg, gap: spacing.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceSubtle,
    },
    rowText: { flex: 1, gap: spacing.xxs },
    note: { marginTop: spacing.lg },
    footer: { gap: spacing.xs },
  }),
);
