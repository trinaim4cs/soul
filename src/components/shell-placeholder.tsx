import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SoulText } from '@/components/soul-text';
import { createThemedStyles, layout, spacing } from '@/theme';

type Props = {
  title: string;
  /** Which phase replaces this placeholder, shown only in development builds. */
  phase: number;
};

/**
 * Navigation-shell placeholder used until the owning phase builds the real screen.
 * It never pretends to be a finished feature.
 */
export function ShellPlaceholder({ title, phase }: Props) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}>
      <SoulText variant="title" accessibilityRole="header">
        {title}
      </SoulText>
      {__DEV__ ? (
        <SoulText variant="caption" tone="tertiary">
          Built in phase {phase}
        </SoulText>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: layout.screenGutter,
      gap: spacing.xs,
    },
  }),
);
