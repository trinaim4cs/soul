import { StyleSheet } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { borders, createThemedStyles, radii, sizes, spacing } from '@/theme';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** `radio` for single choice (gender), `checkbox` for multiple choice (show me). */
  kind?: 'radio' | 'checkbox';
  disabled?: boolean;
};

/** Selectable pill. Selection shows as an ink fill plus a tick, never colour alone. */
export function SoulChip({ label, selected, onPress, kind = 'radio', disabled = false }: Props) {
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      role={kind}
      aria-checked={selected}
      aria-disabled={disabled}
      accessibilityLabel={label}
      style={[styles.chip, selected && styles.selected, disabled && styles.disabled]}>
      {selected ? <SoulIcon name="check" size="sm" color="inverseText" weight="regular" /> : null}
      <SoulText variant="label" tone={selected ? 'inverse' : 'primary'}>
        {label}
      </SoulText>
    </PressableScale>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: sizes.touchTarget,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.full,
      borderWidth: borders.hairline,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    selected: { backgroundColor: colors.inverseSurface, borderColor: colors.inverseSurface },
    disabled: { opacity: 0.5 },
  }),
);
