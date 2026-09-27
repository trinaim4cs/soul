import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SoulText } from '@/components/soul-text';
import { createThemedStyles, layout, radii, sizes, spacing } from '@/theme';

type Props = {
  error: Error;
  onRetry: () => void;
};

/**
 * Last-resort screen for render errors. No stack traces or internal details in production.
 */
export function AppErrorScreen({ error, onRetry }: Props) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl },
      ]}>
      <View style={styles.copy}>
        <SoulText variant="title" accessibilityRole="header">
          Something went wrong
        </SoulText>
        <SoulText tone="secondary">SOUL hit an unexpected problem. Your data is safe.</SoulText>
        {__DEV__ ? (
          <SoulText variant="caption" tone="tertiary">
            {error.message}
          </SoulText>
        ) : null}
      </View>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <SoulText variant="label" tone="inverse">
          Try again
        </SoulText>
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      paddingHorizontal: layout.screenGutter,
    },
    copy: { gap: layout.stackGap },
    button: {
      minHeight: sizes.button.lg,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inverseSurface,
    },
    buttonPressed: { opacity: 0.88 },
  }),
);
