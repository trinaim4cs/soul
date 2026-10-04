import { StyleSheet, View } from 'react-native';

import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { spacing } from '@/theme';

/** The error line under a field or a group of choices: the same icon and caption as SoulInput. */
export function FieldError({ children }: { children: string }) {
  return (
    <View style={styles.row} role="alert" accessibilityLiveRegion="polite">
      <SoulIcon name="error" size="sm" color="textPrimary" weight="regular" />
      <SoulText variant="caption" style={styles.text}>
        {children}
      </SoulText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  text: { flex: 1 },
});
