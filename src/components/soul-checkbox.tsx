import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { borders, createThemedStyles, radii, sizes, spacing } from '@/theme';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Extra content under the label (e.g. a link to read the full document). */
  children?: ReactNode;
};

/** Consent checkbox row: whole row is the target (≥ 48 dp), state is not colour-only. */
export function SoulCheckbox({ checked, onChange, label, children }: Props) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      role="checkbox"
      aria-checked={checked}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <SoulIcon name="check" size="sm" color="inverseText" weight="regular" /> : null}
      </View>
      <View style={styles.text}>
        <SoulText>{label}</SoulText>
        {children}
      </View>
    </Pressable>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      minHeight: sizes.touchTarget,
      paddingVertical: spacing.sm,
      borderRadius: radii.sm,
    },
    pressed: { backgroundColor: colors.surfacePressed },
    box: {
      width: 24,
      height: 24,
      marginTop: 1,
      borderRadius: radii.xs / 2,
      borderWidth: borders.strong,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxChecked: { backgroundColor: colors.inverseSurface },
    text: { flex: 1, gap: spacing.xxs },
  }),
);
