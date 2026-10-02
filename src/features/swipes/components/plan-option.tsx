import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import {
  formatPrice,
  likesLabel,
  planDetail,
  priceSpoken,
  type Plan,
} from '@/features/swipes/model/swipes';
import { borders, createThemedStyles, radii, sizes, spacing } from '@/theme';

type Props = { plan: Plan; selected: boolean; onSelect: () => void };

/** One catalog choice. Selection is the ink border plus the filled tick, never colour alone. */
export function PlanOption({ plan, selected, onSelect }: Props) {
  const styles = useStyles();
  const title = plan.kind === 'topup' ? likesLabel(plan.right_swipes) : plan.title;
  return (
    <PressableScale
      role="radio"
      aria-checked={selected}
      accessibilityLabel={`${title}, ${planDetail(plan)}, ${priceSpoken(plan)}`}
      onPress={onSelect}
      scale={false}
      pressedStyle={styles.pressed}
      style={[styles.option, selected && styles.selected]}>
      <View style={[styles.mark, selected && styles.markSelected]}>
        {selected ? <SoulIcon name="check" size="sm" color="inverseText" weight="regular" /> : null}
      </View>
      <View style={styles.text}>
        <SoulText variant="label">{title}</SoulText>
        <SoulText variant="caption" tone="secondary">
          {planDetail(plan)}
        </SoulText>
      </View>
      <SoulText variant="label" numeric>
        {formatPrice(plan.price_paise)}
      </SoulText>
    </PressableScale>
  );
}

const MARK = spacing.lg;

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: sizes.listRow,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: borders.strong,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    selected: { borderColor: colors.borderStrong },
    pressed: { backgroundColor: colors.surfacePressed },
    mark: {
      width: MARK,
      height: MARK,
      borderRadius: radii.full,
      borderWidth: borders.strong,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    markSelected: { backgroundColor: colors.inverseSurface, borderColor: colors.inverseSurface },
    text: { flex: 1, gap: spacing.xxs / 2 },
  }),
);
