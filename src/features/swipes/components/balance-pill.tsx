import { StyleSheet } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { likesLeftLabel } from '@/features/swipes/model/swipes';
import { createThemedStyles, radii, sizes, spacing } from '@/theme';

type Props = { balance: number; onPress: () => void };

/** Likes left, beside the Discover title. The heart is the one place the accent appears here. */
export function BalancePill({ balance, onPress }: Props) {
  const styles = useStyles();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${likesLeftLabel(balance)}. See plans`}
      onPress={onPress}
      style={styles.pill}>
      <SoulIcon name="favorite" size="sm" color="accent" weight="regular" />
      <SoulText variant="label" numeric>
        {balance}
      </SoulText>
    </PressableScale>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      height: sizes.touchTarget,
      paddingHorizontal: spacing.md,
      borderRadius: radii.full,
      backgroundColor: colors.surfaceSubtle,
    },
  }),
);
