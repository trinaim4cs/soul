import { useId, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import {
  borders,
  createThemedStyles,
  fontFamily,
  radii,
  sizes,
  spacing,
  typeScale,
  useTheme,
} from '@/theme';

type Props = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  /** Visible label above the field (never placeholder-as-label). */
  label: string;
  helper?: string;
  /** Error text below the field; shown with an icon so state is not colour-only. */
  error?: string;
  /** Show a live character counter (requires `maxLength`), e.g. the 30-character hook. */
  showCount?: boolean;
};

export function SoulInput({
  label,
  helper,
  error,
  showCount = false,
  maxLength,
  value,
  multiline,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const labelId = useId();
  const count = value?.length ?? 0;

  return (
    <View style={styles.container}>
      <SoulText variant="supporting" tone="secondary" nativeID={labelId}>
        {label}
      </SoulText>
      <TextInput
        {...rest}
        value={value}
        maxLength={maxLength}
        multiline={multiline}
        accessibilityLabel={label}
        aria-labelledby={labelId}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.textPrimary}
        cursorColor={colors.textPrimary}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          multiline && styles.multiline,
          focused && styles.focused,
          Boolean(error) && styles.invalid,
        ]}
      />
      {error || helper || (showCount && maxLength) ? (
        <View style={styles.footer}>
          {error ? (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <SoulIcon name="error" size="sm" color="textPrimary" weight="regular" />
              <SoulText variant="caption" style={styles.errorText}>
                {error}
              </SoulText>
            </View>
          ) : helper ? (
            <SoulText variant="caption" tone="tertiary" style={styles.flex}>
              {helper}
            </SoulText>
          ) : (
            <View style={styles.flex} />
          )}
          {showCount && maxLength ? (
            <SoulText variant="caption" tone={count >= maxLength ? 'primary' : 'tertiary'} numeric>
              {count}/{maxLength}
            </SoulText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    container: { gap: spacing.xs },
    input: {
      minHeight: sizes.input,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      borderWidth: borders.thin,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      fontFamily: fontFamily.body,
      fontSize: typeScale.body.fontSize,
    },
    multiline: { minHeight: 132, textAlignVertical: 'top', lineHeight: typeScale.body.lineHeight },
    focused: { borderColor: colors.borderStrong },
    invalid: { borderColor: colors.borderStrong, borderWidth: borders.strong },
    footer: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    error: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
    errorText: { flex: 1 },
    flex: { flex: 1 },
  }),
);
