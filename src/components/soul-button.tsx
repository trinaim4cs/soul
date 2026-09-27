import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulIcon, type IconName } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { borders, createThemedStyles, radii, sizes, spacing, useTheme } from '@/theme';

/** `moment`: white pill for the fixed-black brand moments (welcome, match). */
type Variant = 'primary' | 'secondary' | 'ghost' | 'moment';
type Size = 'lg' | 'md' | 'sm';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container width (default for primary actions at the bottom of a screen). */
  block?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * SOUL button. Monochrome: `primary` is the ink pill, `secondary` the outlined pill,
 * `ghost` text-only. Destructive actions use `primary` with explicit wording, not colour.
 * The romantic accent is never used here (DECISIONS D-026).
 */
export function SoulButton({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  loading = false,
  disabled = false,
  block = false,
  accessibilityHint,
  style,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const tone = variant === 'primary' ? 'inverse' : 'primary';
  const iconColor =
    variant === 'primary' ? 'inverseText' : variant === 'moment' ? 'moment' : 'textPrimary';
  const labelStyle = variant === 'moment' ? { color: colors.moment } : undefined;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      // ARIA props work on Android and on the web (accessibilityState is ignored by react-native-web).
      aria-disabled={inactive}
      aria-busy={loading}
      style={[
        styles.base,
        {
          minHeight: sizes.button[size],
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
        },
        styles[variant],
        block && styles.block,
        disabled && styles.disabled,
        style,
      ]}
      pressedStyle={variant === 'ghost' ? styles.ghostPressed : undefined}>
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary'
              ? colors.inverseText
              : variant === 'moment'
                ? colors.moment
                : colors.textPrimary
          }
          accessibilityLabel={`${label}, loading`}
        />
      ) : (
        <View style={styles.content}>
          {icon ? <SoulIcon name={icon} size="sm" color={iconColor} weight="regular" /> : null}
          <SoulText variant="button" tone={tone} numberOfLines={1} style={labelStyle}>
            {label}
          </SoulText>
        </View>
      )}
    </PressableScale>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    base: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.full,
      alignSelf: 'flex-start',
    },
    block: { alignSelf: 'stretch' },
    content: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    primary: { backgroundColor: colors.inverseSurface },
    secondary: {
      backgroundColor: colors.background,
      borderWidth: borders.thin,
      borderColor: colors.borderStrong,
    },
    ghost: { backgroundColor: 'transparent' },
    moment: { backgroundColor: colors.paper },
    ghostPressed: { backgroundColor: colors.surfacePressed },
    disabled: { opacity: 0.4 },
  }),
);
