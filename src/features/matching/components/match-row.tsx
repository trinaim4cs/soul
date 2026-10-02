import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulAvatar } from '@/components/soul-photo';
import { SoulText } from '@/components/soul-text';
import { listTimeLabel, previewText } from '@/features/chat/model/chat';
import { cardTitle } from '@/features/discovery/model/card';
import { matchedLabel, type Match } from '@/features/matching/model/match';
import { createThemedStyles, radii, sizes, spacing } from '@/theme';

type Props = { match: Match; photoUrl: string | undefined; onPress: () => void };

/**
 * One row of the Chats tab: a new match, or a conversation with its last message. "New"
 * and the unread count are words and numbers in a filled pill, never colour alone.
 */
export function MatchRow({ match, photoUrl, onPress }: Props) {
  const styles = useStyles();
  const title = cardTitle(match.person);
  const last = match.last_message;
  const unread = match.unread > 0;
  const detail = last ? previewText(last) : matchedLabel(match.created_at);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${title}${match.seen ? '' : ', new match'}${
        unread ? `, ${match.unread} unread` : ''
      }`}
      accessibilityHint={detail}
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
        <SoulText variant="caption" tone={unread ? 'primary' : 'tertiary'} numberOfLines={1}>
          {detail}
        </SoulText>
      </View>
      <View style={styles.side}>
        {last ? (
          <SoulText variant="micro" tone="tertiary" numeric>
            {listTimeLabel(last.created_at)}
          </SoulText>
        ) : null}
        {!match.seen ? (
          <View style={styles.pill}>
            <SoulText variant="micro" tone="inverse">
              NEW
            </SoulText>
          </View>
        ) : unread ? (
          <View style={styles.pill}>
            <SoulText variant="micro" tone="inverse" numeric>
              {match.unread > 99 ? '99+' : match.unread}
            </SoulText>
          </View>
        ) : null}
      </View>
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
    side: { alignItems: 'flex-end', gap: spacing.xxs },
    pill: {
      minWidth: spacing.lg,
      alignItems: 'center',
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xxs / 2,
      borderRadius: radii.full,
      backgroundColor: colors.inverseSurface,
    },
  }),
);
