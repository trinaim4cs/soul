import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { SoulText } from '@/components/soul-text';
import { borders, createThemedStyles, fontFamily, radii, spacing } from '@/theme';

const LENGTH = 6;

type Props = {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  editable?: boolean;
};

/**
 * Six visible cells backed by one real input, so paste, autofill of one-time codes and
 * screen readers all work on a single field.
 */
export function CodeInput({ value, onChange, invalid = false, editable = true }: Props) {
  const styles = useStyles();
  const inputRef = useRef<TextInput>(null);
  const digits = value.padEnd(LENGTH, ' ').slice(0, LENGTH).split('');

  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessible={false}>
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        {digits.map((digit, index) => {
          const active = index === Math.min(value.length, LENGTH - 1) && editable;
          return (
            <View
              key={index}
              style={[styles.cell, active && styles.cellActive, invalid && styles.cellInvalid]}>
              <SoulText variant="section" numeric>
                {digit.trim()}
              </SoulText>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, LENGTH))}
        maxLength={LENGTH}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        editable={editable}
        caretHidden
        accessibilityLabel="6-digit code"
        style={styles.hidden}
      />
    </Pressable>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
    cell: {
      flex: 1,
      aspectRatio: 0.82,
      maxHeight: 72,
      borderRadius: radii.md,
      borderWidth: borders.thin,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellActive: { borderColor: colors.borderStrong, borderWidth: borders.strong },
    cellInvalid: { borderColor: colors.borderStrong, borderWidth: borders.strong },
    hidden: {
      position: 'absolute',
      width: 1,
      height: 1,
      opacity: 0,
      fontFamily: fontFamily.body,
    },
  }),
);
