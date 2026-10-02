import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulIcon } from '@/components/soul-icon';
import { SoulAvatar } from '@/components/soul-photo';
import { SoulText } from '@/components/soul-text';
import { cardTitle } from '@/features/discovery/model/card';
import { matchedLabel, type Match } from '@/features/matching/model/match';
import { createThemedStyles, radii, sizes, spacing } from '@/theme';

type Props = { match: Match; photoUrl: string | undefined; onPress: () => void };

/** One match. "New" is a word and a filled pill, never colour alone. */
export function MatchRow({ match, photoUrl, onPress }: Props) {
  const styles = useStyles();
  const title = cardTitle(match.person);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${title}${match.seen ? '' : ', new match'}`}
      accessibilityHint={matchedLabel(match.created_at)}
      onPress={onPress}
      scale={false}
      pressedStyle={styles.pressed}
      style={styles.row}>
      <SoulAvatar
        source={photoUrl ? { uri: photoUrl } : null}
        blurRadius={match.person.anonymous ? sizes.anonymousBlur : undefined}
        recyclingKey={match.id}
      />
      <View style={styles.text}>
        <SoulText variant="label" numberOfLines={1}>
          {title}
        </SoulText>
        <SoulText variant="caption" tone="tertiary">
          {matchedLabel(match.created_at)}
        </SoulText>
      </View>
      {match.seen ? null : (
        <View style={styles.new}>
          <SoulText variant="micro" tone="inverse">
            NEW
          </SoulText>
        </View>
      )}
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
    new: {
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xxs / 2,
      borderRadius: radii.full,
      backgroundColor: colors.inverseSurface,
    },
  }),
);
