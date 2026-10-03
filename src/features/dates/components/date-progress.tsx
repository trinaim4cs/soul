import { StyleSheet, View } from 'react-native';

import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { useMyDates } from '@/features/dates/api/dates';
import { progressDetail, progressLabel } from '@/features/dates/model/dates';
import { createThemedStyles, radii, spacing } from '@/theme';

/**
 * The owner's private progress toward the fire badge (spec 36: "the internal user may have a
 * private progress indicator"). Shown only on the You tab, never to anyone else.
 */
export function DateProgress({ userId }: { userId: string }) {
  const styles = useStyles();
  const dates = useMyDates(userId);
  if (!dates.data) return null;
  const data = dates.data;
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${progressLabel(data)}. ${progressDetail(data)}`}>
      <SoulIcon
        name="local_fire_department"
        size="md"
        color={data.active ? 'textPrimary' : 'textTertiary'}
        weight="regular"
      />
      <View style={styles.text}>
        <SoulText variant="label">{progressLabel(data)}</SoulText>
        <SoulText variant="supporting" tone="secondary">
          {progressDetail(data)}
        </SoulText>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceSubtle,
    },
    text: { flex: 1, gap: spacing.xxs },
  }),
);
