import { StyleSheet, View } from 'react-native';

import { SoulIcon, type IconName } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { borders, createThemedStyles, radii, sizes, spacing } from '@/theme';

type BadgeProps = {
  label: string;
  icon?: IconName;
  /** `solid`: ink pill with inverse text. `outline`: hairline pill. `onPhoto`: over imagery. */
  appearance?: 'solid' | 'outline' | 'onPhoto';
};

/** Small monochrome pill. Badges never use the romantic accent (DECISIONS D-026). */
export function SoulBadge({ label, icon, appearance = 'outline' }: BadgeProps) {
  const styles = useStyles();
  const tone =
    appearance === 'solid' ? 'inverse' : appearance === 'onPhoto' ? 'onPhoto' : 'primary';
  const iconColor =
    appearance === 'solid' ? 'inverseText' : appearance === 'onPhoto' ? 'onPhoto' : 'textPrimary';
  return (
    <View
      style={[styles.badge, styles[appearance]]}
      accessibilityRole="text"
      accessibilityLabel={label}>
      {icon ? <SoulIcon name={icon} size="sm" color={iconColor} weight="regular" /> : null}
      <SoulText variant="micro" tone={tone}>
        {label}
      </SoulText>
    </View>
  );
}

/** Public verification indicator: a single simple mark, never internal details (spec 12). */
export function VerifiedBadge({ onPhoto = false }: { onPhoto?: boolean }) {
  return (
    <SoulIcon
      name="verified"
      size="sm"
      color={onPhoto ? 'onPhoto' : 'textPrimary'}
      weight="regular"
      accessibilityLabel="Verified"
    />
  );
}

/**
 * Public Hot Person badge (spec 36, D-051): a fire mark only, never words and never a date count.
 * Monochrome like every badge. Screen readers still hear what it means.
 */
export function HotPersonBadge({ onPhoto = false }: { onPhoto?: boolean }) {
  return (
    <SoulIcon
      name="local_fire_department"
      size="sm"
      color={onPhoto ? 'onPhoto' : 'textPrimary'}
      weight="regular"
      accessibilityLabel="Hot Person"
    />
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xxs,
      minHeight: sizes.badge,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.full,
    },
    solid: { backgroundColor: colors.inverseSurface },
    outline: { borderWidth: borders.thin, borderColor: colors.border },
    onPhoto: { backgroundColor: colors.photoScrim },
  }),
);
