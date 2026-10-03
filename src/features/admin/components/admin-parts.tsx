import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulText } from '@/components/soul-text';
import { borders, createThemedStyles, radii, spacing } from '@/theme';

/** A titled group on the admin screens, with an optional count. */
export function AdminSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <SoulText variant="label" tone="secondary" accessibilityRole="header">
        {count === undefined ? title : `${title} (${count})`}
      </SoulText>
      {children}
    </View>
  );
}

/** One item waiting for a decision. */
export function AdminCard({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.card}>{children}</View>;
}

/** A label and its value, on one line when they fit. */
export function Fact({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.fact}>
      <SoulText variant="supporting" tone="secondary" style={styles.factLabel}>
        {label}
      </SoulText>
      <SoulText variant="supporting" style={styles.factValue} selectable>
        {value}
      </SoulText>
    </View>
  );
}

export function Nothing({ text = 'Nothing waiting.' }: { text?: string }) {
  return (
    <SoulText variant="supporting" tone="tertiary">
      {text}
    </SoulText>
  );
}

export function ButtonRow({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.buttons}>{children}</View>;
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    section: { marginTop: spacing.xl, gap: spacing.sm },
    card: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: borders.hairline,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    fact: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm },
    factLabel: { minWidth: 120 },
    factValue: { flexShrink: 1 },
    buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  }),
);
