import { StyleSheet, View } from 'react-native';

import { SoulIcon, type IconName } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { createThemedStyles, radii, sizes, spacing } from '@/theme';

export type InstallStep = { text: string; icon?: IconName };

/** Numbered install steps. The number carries the order; an icon shows what to look for. */
export function InstallSteps({ steps }: { steps: InstallStep[] }) {
  const styles = useStyles();
  return (
    <View style={styles.list} accessibilityRole="list">
      {steps.map((step, index) => (
        <View key={step.text} style={styles.row}>
          <View style={styles.number}>
            <SoulText variant="label" numeric>
              {index + 1}
            </SoulText>
          </View>
          <View style={styles.body}>
            <SoulText>{step.text}</SoulText>
            {step.icon ? <SoulIcon name={step.icon} size="md" color="textSecondary" /> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    list: { gap: spacing.lg },
    row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
    number: {
      width: sizes.avatar.xs,
      height: sizes.avatar.xs,
      borderRadius: radii.full,
      backgroundColor: colors.surfaceSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexWrap: 'wrap',
      minHeight: sizes.avatar.xs,
    },
  }),
);
