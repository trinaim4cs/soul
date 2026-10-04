import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulIcon, type IconName } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { borders, createThemedStyles, radii, sizes, spacing, useTheme } from '@/theme';

/** `moment`: white pill for the fixed-black brand moments (welcome, match). */
/** `accent` is for Like only (D-026: the accent is reserved for like, match and hearts). */
type Variant = 'primary' | 'secondary' | 'ghost' | 'moment' | 'accent';
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
  /**
   * A text link on the content edge (`ghost` only): no side padding, so the label lines up
   * with the text around it. The touch target keeps its full height.
   */
  inline?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  /** Layout of the touch box itself, e.g. `{ flex: 1 }` for buttons sharing a row. */
  containerStyle?: StyleProp<ViewStyle>;
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
  inline = false,
  accessibilityHint,
  style,
  containerStyle,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const tone = variant === 'primary' ? 'inverse' : 'primary';
  const iconColor =
    variant === 'primary'
      ? 'inverseText'
      : variant === 'moment'
        ? 'moment'
        : variant === 'accent'
          ? 'onAccent'
          : 'textPrimary';
  const labelStyle =
    variant === 'moment'
      ? { color: colors.moment }
      : variant === 'accent'
        ? { color: colors.onAccent }
        : undefined;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      containerStyle={containerStyle}
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
          paddingHorizontal: inline ? 0 : size === 'sm' ? spacing.md : spacing.lg,
        },
        styles[variant],
        block && styles.block,
        disabled && styles.disabled,
        style,
      ]}
      pressedStyle={variant === 'ghost' ? styles.ghostPressed : undefined}>
      {/* The label keeps its place while loading (hidden under the spinner), so the button
          never changes width and nothing around it jumps. */}
      <View style={[styles.content, loading && styles.hidden]}>
        {icon ? <SoulIcon name={icon} size="sm" color={iconColor} weight="regular" /> : null}
        <SoulText variant="button" tone={tone} numberOfLines={1} style={labelStyle}>
          {label}
        </SoulText>
      </View>
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator
            color={
              variant === 'primary'
                ? colors.inverseText
                : variant === 'moment'
                  ? colors.moment
                  : variant === 'accent'
                    ? colors.onAccent
                    : colors.textPrimary
            }
            accessibilityLabel={`${label}, loading`}
          />
        </View>
      ) : null}
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
    hidden: { opacity: 0 },
    spinner: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: { backgroundColor: colors.inverseSurface },
    secondary: {
      backgroundColor: colors.background,
      borderWidth: borders.thin,
      borderColor: colors.borderStrong,
    },
    ghost: { backgroundColor: 'transparent' },
    moment: { backgroundColor: colors.paper },
    accent: { backgroundColor: colors.accent },
    ghostPressed: { backgroundColor: colors.surfacePressed },
    disabled: { opacity: 0.4 },
  }),
);
