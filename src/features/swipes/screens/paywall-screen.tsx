import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulButton } from '@/components/soul-button';
import { SoulIcon } from '@/components/soul-icon';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { ErrorState, LoadingState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { refreshSwipes, usePlans, useSwipeBalance } from '@/features/swipes/api/swipes';
import { PlanOption } from '@/features/swipes/components/plan-option';
import {
  balanceSummary,
  formatPrice,
  splitCatalog,
  type Plan,
} from '@/features/swipes/model/swipes';
import { payments } from '@/services/payments';
import { createThemedStyles, radii, sizes, spacing } from '@/theme';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Plans and top-ups (spec 22). The catalog, the balance and every price come from the server;
 * buying goes through the payment service, and only the server ever grants anything.
 * No countdowns, no "most popular" badges, nothing preselected.
 */
export function PaywallScreen() {
  const styles = useStyles();
  const userId = useCurrentUserId();
  const plans = usePlans();
  const swipes = useSwipeBalance(userId);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (plans.isPending) return <LoadingState />;
  if (plans.isError || !userId) {
    return (
      <ErrorState
        title="Couldn't load plans"
        body="Check your connection and try again."
        onRetry={() => void plans.refetch()}
      />
    );
  }

  const { subscriptions, topups } = splitCatalog(plans.data);
  const balance = swipes.data ?? null;
  const outOfLikes = balance?.balance === 0;

  function choose(plan: Plan) {
    setSelected(plan);
    setNotice(null);
  }

  async function buy() {
    if (!selected || busy || !userId) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await payments.checkout(selected.id);
      if (result === 'completed') {
        await refreshSwipes(userId);
        close();
        return;
      }
      if (result === 'unavailable') {
        setNotice("Payments aren't open yet. Nothing was charged.");
      } else if (result === 'failed') {
        setNotice("That payment didn't go through. Try again.");
      }
    } catch {
      setNotice("That payment didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SoulScreen
      scroll
      footer={
        <>
          {notice ? (
            <SoulText variant="supporting" align="center" role="alert">
              {notice}
            </SoulText>
          ) : null}
          <SoulButton
            label={
              selected ? `Continue · ${formatPrice(selected.price_paise)}` : 'Choose an option'
            }
            block
            disabled={!selected}
            loading={busy}
            onPress={() => void buy()}
          />
        </>
      }>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={close}
        style={styles.close}>
        <SoulIcon name="close" size="md" />
      </PressableScale>

      <View style={styles.intro}>
        <SoulText variant="title" accessibilityRole="header">
          {outOfLikes ? "You're out of likes" : 'More likes'}
        </SoulText>
        <SoulText tone="secondary">
          A like tells someone you&apos;re interested. Passing is always free.
        </SoulText>
        {balance && (balance.balance > 0 || balance.plan) ? (
          <SoulText variant="supporting" tone="tertiary">
            {balanceSummary(balance)}
          </SoulText>
        ) : null}
      </View>

      <View style={styles.section} role="radiogroup" aria-label="Plans">
        <SoulText variant="label" tone="secondary">
          Plans
        </SoulText>
        {subscriptions.map((plan) => (
          <PlanOption
            key={plan.id}
            plan={plan}
            selected={selected?.id === plan.id}
            onSelect={() => choose(plan)}
          />
        ))}
        <SoulText variant="caption" tone="tertiary">
          One period at a time. No automatic renewal. Unused plan likes end with the plan.
        </SoulText>
      </View>

      <View style={styles.section} role="radiogroup" aria-label="Top-ups">
        <SoulText variant="label" tone="secondary">
          Top-ups
        </SoulText>
        {topups.map((plan) => (
          <PlanOption
            key={plan.id}
            plan={plan}
            selected={selected?.id === plan.id}
            onSelect={() => choose(plan)}
          />
        ))}
        <SoulText variant="caption" tone="tertiary">
          Work with or without a plan. They don&apos;t unlock Instant Meet.
        </SoulText>
      </View>

      <SoulText
        variant="supporting"
        accessibilityRole="link"
        style={styles.policy}
        onPress={() => router.push('/legal/purchases')}>
        Purchases and refunds
      </SoulText>
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    close: {
      width: sizes.touchTarget,
      height: sizes.touchTarget,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSubtle,
    },
    intro: { gap: spacing.sm, marginTop: spacing.lg },
    section: { gap: spacing.sm, marginTop: spacing.xl },
    policy: {
      alignSelf: 'flex-start',
      marginTop: spacing.lg,
      paddingVertical: spacing.sm,
      textDecorationLine: 'underline',
    },
  }),
);
