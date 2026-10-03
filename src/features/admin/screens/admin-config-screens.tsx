import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulInput } from '@/components/soul-input';
import { SoulScreen } from '@/components/soul-screen';
import { SoulSwitch } from '@/components/soul-switch';
import { SoulText } from '@/components/soul-text';
import { ErrorState, LoadingState } from '@/components/states';
import { setFlag, updatePlan, useAdminFlags, useAdminPlans } from '@/features/admin/api/admin';
import { AdminCard, AdminSection } from '@/features/admin/components/admin-parts';
import {
  paiseToRupees,
  rupeesToPaise,
  type AdminFlag,
  type AdminPlan,
} from '@/features/admin/model/admin';
import { createThemedStyles, spacing } from '@/theme';

/** Admins only: prices, likes and whether a plan is on sale. Open orders keep their price. */
export function AdminPlansScreen() {
  const plans = useAdminPlans();
  if (plans.isPending) return <LoadingState />;
  if (plans.isError || !plans.data) {
    return (
      <ErrorState
        title="Couldn't load plans"
        body="Check your connection and try again."
        onRetry={() => void plans.refetch()}
      />
    );
  }
  return (
    <SoulScreen scroll edges={{ top: false, bottom: true }}>
      <SoulText variant="title" accessibilityRole="header">
        Plans
      </SoulText>
      <SoulText variant="supporting" tone="secondary">
        Changes apply to new checkouts. Every change is logged with the old value.
      </SoulText>
      {plans.data.map((plan) => (
        <PlanEditor key={plan.id} plan={plan} />
      ))}
    </SoulScreen>
  );
}

function PlanEditor({ plan }: { plan: AdminPlan }) {
  const styles = useStyles();
  const [price, setPrice] = useState(paiseToRupees(plan.price_paise));
  const [likes, setLikes] = useState(String(plan.right_swipes));
  const [active, setActive] = useState(plan.active);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const paise = rupeesToPaise(price);
  const likeCount = /^\d{1,4}$/.test(likes.trim()) ? Number(likes.trim()) : null;
  const valid = paise !== null && likeCount !== null && likeCount >= 1 && likeCount <= 1000;
  const changed =
    paise !== plan.price_paise || likeCount !== plan.right_swipes || active !== plan.active;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await updatePlan(plan.id, paise, likeCount, active);
      setMessage(outcome.ok ? 'Saved.' : `Not saved (${outcome.reason ?? 'refused'}).`);
    } catch {
      setMessage("Couldn't save that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminSection title={plan.title}>
      <AdminCard>
        <SoulText variant="supporting" tone="secondary">
          {plan.kind === 'subscription'
            ? `Plan · ${plan.period_label ?? ''}`
            : 'Top-up, never expires'}
          {plan.includes_instant ? ' · includes Instant Meet' : ''}
        </SoulText>
        <View style={styles.row}>
          <View style={styles.grow}>
            <SoulInput
              label="Price (₹)"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              error={paise === null ? '₹1 to ₹10,000' : undefined}
            />
          </View>
          <View style={styles.grow}>
            <SoulInput
              label="Likes"
              value={likes}
              onChangeText={setLikes}
              keyboardType="number-pad"
              error={valid || paise === null ? undefined : '1 to 1,000'}
            />
          </View>
        </View>
        <View style={styles.switchRow}>
          <SoulText variant="body" style={styles.grow}>
            On sale
          </SoulText>
          <SoulSwitch
            value={active}
            onValueChange={setActive}
            accessibilityLabel={`${plan.title} on sale`}
          />
        </View>
        <SoulButton
          label="Save"
          size="sm"
          disabled={!valid || !changed || busy}
          loading={busy}
          onPress={() => void save()}
          style={styles.alignStart}
        />
        {message ? (
          <SoulText variant="supporting" tone="secondary" accessibilityRole="alert">
            {message}
          </SoulText>
        ) : null}
      </AdminCard>
    </AdminSection>
  );
}

/** Admins only: the switches and limits SOUL can change without a release (D-055). */
export function AdminFlagsScreen() {
  const flags = useAdminFlags();
  if (flags.isPending) return <LoadingState />;
  if (flags.isError || !flags.data) {
    return (
      <ErrorState
        title="Couldn't load flags"
        body="Check your connection and try again."
        onRetry={() => void flags.refetch()}
      />
    );
  }
  return (
    <SoulScreen scroll edges={{ top: false, bottom: true }}>
      <SoulText variant="title" accessibilityRole="header">
        Feature flags
      </SoulText>
      <SoulText variant="supporting" tone="secondary">
        Pausing Instant Meet takes everyone waiting out of it; sessions already running finish
        normally. Every change is logged.
      </SoulText>
      <AdminSection title="Flags">
        {flags.data.map((flag) => (
          <FlagEditor key={flag.key} flag={flag} />
        ))}
      </AdminSection>
    </SoulScreen>
  );
}

function FlagEditor({ flag }: { flag: AdminFlag }) {
  const styles = useStyles();
  const [text, setText] = useState(String(flag.value ?? ''));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(value: boolean | number) {
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await setFlag(flag.key, value);
      setMessage(outcome.ok ? 'Saved.' : `Not saved (${outcome.reason ?? 'refused'}).`);
    } catch {
      setMessage("Couldn't save that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (flag.kind === 'boolean') {
    return (
      <AdminCard>
        <View style={styles.switchRow}>
          <SoulText variant="body" style={styles.grow}>
            {flag.label}
          </SoulText>
          <SoulSwitch
            value={flag.value === true}
            disabled={busy}
            onValueChange={(value) => void save(value)}
            accessibilityLabel={flag.label}
          />
        </View>
        {message ? (
          <SoulText variant="supporting" tone="secondary" accessibilityRole="alert">
            {message}
          </SoulText>
        ) : null}
      </AdminCard>
    );
  }

  const number = /^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : null;
  const inRange =
    number !== null && number >= (flag.min ?? 0) && number <= (flag.max ?? Number.MAX_SAFE_INTEGER);
  return (
    <AdminCard>
      <SoulInput
        label={flag.label}
        value={text}
        onChangeText={setText}
        keyboardType="number-pad"
        helper={`${flag.min} to ${flag.max}`}
        error={inRange ? undefined : `${flag.min} to ${flag.max}`}
      />
      <SoulButton
        label="Save"
        size="sm"
        disabled={!inRange || number === flag.value || busy}
        loading={busy}
        onPress={() => void save(number!)}
        style={styles.alignStart}
      />
      {message ? (
        <SoulText variant="supporting" tone="secondary" accessibilityRole="alert">
          {message}
        </SoulText>
      ) : null}
    </AdminCard>
  );
}

const useStyles = createThemedStyles(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: spacing.md },
    grow: { flex: 1 },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    alignStart: { alignSelf: 'flex-start' },
  }),
);
