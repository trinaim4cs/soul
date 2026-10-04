import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { FieldError } from '@/components/field-error';
import { PressableScale } from '@/components/pressable-scale';
import { SoulButton } from '@/components/soul-button';
import { SoulChip } from '@/components/soul-chip';
import { SoulIcon } from '@/components/soul-icon';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { ErrorState, LoadingState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import {
  AGE_MAX,
  AGE_MIN,
  clampRange,
  type DiscoveryFilters,
} from '@/features/discovery/model/filters';
import { saveFilters, useDiscoveryFilters } from '@/features/discovery/api/filters';
import { useDeckStore } from '@/features/discovery/store/deck-store';
import {
  GENDERS,
  SHOW_ME_LABEL,
  ZODIAC_SIGNS,
  toggleGender,
  zodiacLabel,
  type ZodiacSign,
} from '@/features/profile/model/profile';
import { createThemedStyles, radii, sizes, spacing } from '@/theme';

/** Discovery filters (spec 18): age range, who to see, zodiac. Nothing else. */
export function FiltersScreen() {
  const userId = useCurrentUserId();
  const filters = useDiscoveryFilters(userId);
  if (filters.isPending) return <LoadingState />;
  if (filters.isError || !filters.data || !userId) {
    return (
      <ErrorState
        title="Couldn't load your filters"
        body="Check your connection and try again."
        onRetry={() => void filters.refetch()}
      />
    );
  }
  return <FiltersForm initial={filters.data} userId={userId} />;
}

function FiltersForm({ initial, userId }: { initial: DiscoveryFilters; userId: string }) {
  const styles = useStyles();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  // Shown where the problem is: under Show me, and next to the button for a failed save.
  const [askedForShowMe, setAskedForShowMe] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const refresh = useDeckStore((state) => state.refresh);

  const toggleZodiac = (sign: ZodiacSign) =>
    setValues((prev) => {
      const next = prev.zodiac.includes(sign)
        ? prev.zodiac.filter((item) => item !== sign)
        : [...prev.zodiac, sign];
      return { ...prev, zodiac: ZODIAC_SIGNS.filter((item) => next.includes(item)) };
    });

  async function save() {
    if (values.showMe.length === 0) {
      setAskedForShowMe(true);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await saveFilters(userId, values);
      void refresh();
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {
      setSaveError("Couldn't save your filters. Check your connection and try again.");
      setSaving(false);
    }
  }

  return (
    <SoulScreen
      scroll
      edges={{ top: false, bottom: true }}
      // A sheet has no header above it, so the title needs its own room from the edge.
      contentStyle={styles.sheet}
      footer={
        <View style={styles.footer}>
          {saveError ? <FieldError>{saveError}</FieldError> : null}
          <SoulButton label="Show profiles" block loading={saving} onPress={() => void save()} />
        </View>
      }>
      {Platform.OS === 'android' ? (
        // The native grabber is iOS-only; this shows where the sheet starts and that it drags
        // down to close (it also marks the sheet's edge on a black background in dark mode).
        <View style={styles.handleRow} importantForAccessibility="no-hide-descendants">
          <View style={styles.handle} />
        </View>
      ) : null}
      <SoulText variant="title" accessibilityRole="header">
        Filters
      </SoulText>

      <View style={styles.section}>
        <SoulText variant="label" tone="secondary">
          Age
        </SoulText>
        <SoulText variant="subheading" numeric>
          {values.minAge} to {values.maxAge}
        </SoulText>
        <View style={styles.steppers}>
          <Stepper
            label="Youngest"
            value={values.minAge}
            onChange={(minAge) =>
              setValues((prev) => ({ ...prev, ...clampRange(minAge, prev.maxAge, 'min') }))
            }
            canDecrease={values.minAge > AGE_MIN}
            canIncrease={values.minAge < values.maxAge}
          />
          <Stepper
            label="Oldest"
            value={values.maxAge}
            onChange={(maxAge) =>
              setValues((prev) => ({ ...prev, ...clampRange(prev.minAge, maxAge, 'max') }))
            }
            canDecrease={values.maxAge > values.minAge}
            canIncrease={values.maxAge < AGE_MAX}
          />
        </View>
      </View>

      <View style={styles.section} role="group" aria-label="Show me">
        <SoulText variant="label" tone="secondary">
          Show me
        </SoulText>
        <View style={styles.chips}>
          {GENDERS.map((gender) => (
            <SoulChip
              key={gender}
              kind="checkbox"
              label={SHOW_ME_LABEL[gender]}
              selected={values.showMe.includes(gender)}
              onPress={() =>
                setValues((prev) => ({ ...prev, showMe: toggleGender(prev.showMe, gender) }))
              }
            />
          ))}
        </View>
        {askedForShowMe && values.showMe.length === 0 ? (
          <FieldError>Choose at least one.</FieldError>
        ) : null}
      </View>

      <View style={styles.section} role="group" aria-label="Zodiac">
        <SoulText variant="label" tone="secondary">
          Zodiac
        </SoulText>
        <SoulText variant="supporting" tone="tertiary">
          {values.zodiac.length === 0
            ? 'Any sign. Choose signs to narrow it down.'
            : 'Only people who show their zodiac can match a zodiac filter.'}
        </SoulText>
        <View style={styles.chips}>
          {ZODIAC_SIGNS.map((sign) => (
            <SoulChip
              key={sign}
              kind="checkbox"
              label={zodiacLabel(sign)}
              selected={values.zodiac.includes(sign)}
              onPress={() => toggleZodiac(sign)}
            />
          ))}
        </View>
      </View>
    </SoulScreen>
  );
}

type StepperProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  canDecrease: boolean;
  canIncrease: boolean;
};

function Stepper({ label, value, onChange, canDecrease, canIncrease }: StepperProps) {
  const styles = useStyles();
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ now: value, min: AGE_MIN, max: AGE_MAX }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment' && canIncrease) onChange(value + 1);
        if (event.nativeEvent.actionName === 'decrement' && canDecrease) onChange(value - 1);
      }}>
      <SoulText variant="supporting" tone="secondary">
        {label}
      </SoulText>
      <View style={styles.stepperRow}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${label} younger`}
          disabled={!canDecrease}
          onPress={() => onChange(value - 1)}
          style={[styles.stepButton, !canDecrease && styles.stepDisabled]}>
          <SoulIcon name="remove" size="md" />
        </PressableScale>
        <SoulText variant="subheading" numeric style={styles.stepValue}>
          {value}
        </SoulText>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${label} older`}
          disabled={!canIncrease}
          onPress={() => onChange(value + 1)}
          style={[styles.stepButton, !canIncrease && styles.stepDisabled]}>
          <SoulIcon name="add" size="md" />
        </PressableScale>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    sheet: { paddingTop: spacing.xl },
    handleRow: { position: 'absolute', top: spacing.sm, left: 0, right: 0, alignItems: 'center' },
    handle: {
      width: spacing.xl,
      height: spacing.xxs,
      borderRadius: radii.full,
      backgroundColor: colors.border,
    },
    section: { gap: spacing.sm, marginTop: spacing.xl },
    footer: { gap: spacing.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    steppers: { flexDirection: 'row', gap: spacing.md },
    stepper: {
      flex: 1,
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceSubtle,
    },
    stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    stepButton: {
      width: sizes.touchTarget,
      height: sizes.touchTarget,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    stepDisabled: { opacity: 0.35 },
    stepValue: { minWidth: sizes.touchTarget, textAlign: 'center' },
  }),
);
