import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SoulText } from '@/components/soul-text';
import { timeLabel, type ChatMessage, type ChatRow } from '@/features/chat/model/chat';
import { borders, createThemedStyles, radii, spacing } from '@/theme';

/**
 * An invisible hair space after the text. Android rounds a shrink-wrapped text box to whole
 * pixels; when that rounds down, a single-line message no longer fits and its last word
 * wraps out of the bubble. Trailing whitespace is measured but never forces a wrap, so it
 * gives the line the fraction of a pixel it needs (wrapped lines already have this from the
 * space at each break).
 */
const TRAILING_SLACK = '\u200A';

type Props = {
  row: Extract<ChatRow, { kind: 'message' }>;
  /** The other person's name, for the reply quote and screen readers. */
  otherName: string;
  /**
   * Widest a bubble may be, in points. A fixed number, not a percentage: inside the list a
   * percentage is measured against a width that changes between passes, and Android then
   * draws a cached two-line layout into a one-line bubble (the last word disappears).
   */
  maxWidth: number;
  /** Delivery line, shown only under the caller's newest message. */
  status: string | null;
  onReply: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
};

/**
 * One message. Mine sit right on ink, theirs left on a quiet surface; the side and the
 * fill both carry the meaning, never colour alone. Long-press (or the Reply action for
 * screen readers) answers a message. Bubbles do not animate individually (spec 25).
 */
export const MessageBubble = memo(function MessageBubble({
  row,
  otherName,
  maxWidth,
  status,
  onReply,
  onRetry,
}: Props) {
  const styles = useStyles();
  const { message, mine } = row;
  const failed = message.delivery === 'failed';
  const canReply = message.id != null;
  const who = mine ? 'You' : otherName;

  return (
    <View
      style={[
        styles.row,
        mine ? styles.rowMine : styles.rowTheirs,
        row.joinsPrevious && styles.joined,
      ]}>
      <Pressable
        onLongPress={canReply ? () => onReply(message) : undefined}
        onPress={failed ? () => onRetry(message) : undefined}
        delayLongPress={280}
        accessibilityRole={failed ? 'button' : 'text'}
        accessibilityLabel={`${who}: ${message.body}. ${timeLabel(message.created_at)}${status ? `. ${status}` : ''}`}
        accessibilityActions={canReply ? [{ name: 'reply', label: 'Reply' }] : undefined}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'reply') onReply(message);
        }}
        style={[
          styles.bubble,
          { maxWidth },
          mine ? styles.mine : styles.theirs,
          message.id == null && styles.pending,
        ]}>
        {message.reply_to ? (
          <View style={[styles.quote, mine ? styles.quoteMine : styles.quoteTheirs]}>
            <SoulText variant="micro" tone={mine ? 'inverse' : 'secondary'}>
              {message.reply_to.sender_id === message.sender_id ? who : mine ? otherName : 'You'}
            </SoulText>
            <SoulText variant="caption" tone={mine ? 'inverse' : 'secondary'} numberOfLines={2}>
              {message.reply_to.body}
            </SoulText>
          </View>
        ) : null}
        <SoulText tone={mine ? 'inverse' : 'primary'}>
          {message.body}
          {TRAILING_SLACK}
        </SoulText>
      </Pressable>
      {row.endsRun || status ? (
        <SoulText variant="micro" tone="tertiary" style={styles.meta}>
          {status ? `${status}` : timeLabel(message.created_at)}
        </SoulText>
      ) : null}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    row: { marginTop: spacing.md, gap: spacing.xxs },
    joined: { marginTop: spacing.xxs },
    rowMine: { alignItems: 'flex-end' },
    rowTheirs: { alignItems: 'flex-start' },
    bubble: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.lg,
      gap: spacing.xs,
    },
    mine: { backgroundColor: colors.inverseSurface, borderBottomRightRadius: radii.xs },
    theirs: { backgroundColor: colors.surfaceSubtle, borderBottomLeftRadius: radii.xs },
    pending: { opacity: 0.6 },
    quote: { paddingLeft: spacing.xs, borderLeftWidth: borders.strong, gap: spacing.xxs / 2 },
    quoteMine: { borderLeftColor: colors.inverseText },
    quoteTheirs: { borderLeftColor: colors.borderStrong },
    meta: { marginHorizontal: spacing.xxs },
  }),
);
