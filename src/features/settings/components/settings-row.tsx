import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { createThemedStyles, sizes, spacing, type IconName } from '@/theme';

type Props = { icon: IconName; label: string; detail?: string; onPress: () => void };

/** Full-width settings row: highlights on press instead of scaling (MOTION_SYSTEM). */
export function SettingsRow({ icon, label, detail, onPress }: Props) {
  const styles = useStyles();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      onPress={onPress}
      scale={false}
      pressedStyle={styles.pressed}
      style={styles.row}>
      <SoulIcon name={icon} size="md" color="textSecondary" />
      <View style={styles.text}>
        <SoulText variant="label">{label}</SoulText>
        {detail ? (
          <SoulText variant="caption" tone="tertiary">
            {detail}
          </SoulText>
        ) : null}
      </View>
      <SoulIcon name="chevron_right" size="md" color="textTertiary" />
    </PressableScale>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: sizes.listRow,
      paddingVertical: spacing.sm,
    },
    pressed: { backgroundColor: colors.surfacePressed },
    text: { flex: 1, gap: spacing.xxs / 2 },
  }),
);
