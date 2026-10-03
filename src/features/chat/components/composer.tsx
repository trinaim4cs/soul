import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { cleanDraft, MAX_MESSAGE_LENGTH, type ReplyTarget } from '@/features/chat/model/chat';
import {
  borders,
  createThemedStyles,
  fontFamily,
  radii,
  sizes,
  spacing,
  typeScale,
  useTheme,
} from '@/theme';

type Props = {
  /** Who a reply is addressed to ("You" or the other person's name). */
  replyingTo: { target: ReplyTarget; name: string } | null;
  onCancelReply: () => void;
  onSend: (body: string) => void;
  onTyping: (hasText: boolean) => void;
};

/** Lines the field grows to before it scrolls inside itself. */
const MAX_LINES = 5;

/**
 * The floating composer (spec 25): a rounded field that sits above the keyboard, grows with
 * the text up to five lines, and keeps the keyboard open after sending.
 */
export function Composer({ replyingTo, onCancelReply, onSend, onTyping }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  // A browser textarea does not grow with its text, so its height follows the content here.
  const [webHeight, setWebHeight] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const body = cleanDraft(draft);

  function change(text: string) {
    setDraft(text);
    onTyping(text.trim().length > 0);
  }

  function submit() {
    if (!body) return;
    onSend(body);
    setDraft('');
    setWebHeight(null);
  }

  return (
    <View style={[styles.shell, focused && styles.shellFocused]}>
      {replyingTo ? (
        <View style={styles.reply}>
          <View style={styles.replyText}>
            <SoulText variant="micro" tone="secondary">
              Replying to {replyingTo.name}
            </SoulText>
            <SoulText variant="caption" tone="secondary" numberOfLines={1}>
              {replyingTo.target.body}
            </SoulText>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            onPress={onCancelReply}
            hitSlop={spacing.sm}
            style={styles.cancel}>
            <SoulIcon name="close" size="sm" color="textSecondary" />
          </PressableScale>
        </View>
      ) : null}
      <View style={styles.row}>
        <TextInput
          value={draft}
          onChangeText={change}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Message"
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.textPrimary}
          cursorColor={colors.textPrimary}
          accessibilityLabel="Message"
          numberOfLines={1}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onContentSizeChange={
            Platform.OS === 'web'
              ? (event) => setWebHeight(Math.ceil(event.nativeEvent.contentSize.height))
              : undefined
          }
          style={[
            styles.input,
            webHeight !== null && draft.length > 0 ? { height: webHeight } : null,
            // The browser's own focus ring drew a rectangle inside the rounded composer; the
            // composer's border shows focus instead (shellFocused).
            Platform.OS === 'web' ? styles.noOutline : null,
          ]}
        />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Send"
          aria-disabled={!body}
          disabled={!body}
          onPress={submit}
          hitSlop={(sizes.touchTarget - sizes.button.sm) / 2}
          style={[styles.send, !body && styles.sendDisabled]}>
          <SoulIcon name="send" size="md" color="inverseText" weight="regular" />
        </PressableScale>
      </View>
    </View>
  );
}

const LINE = typeScale.body.lineHeight ?? 26;

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    shell: {
      marginHorizontal: spacing.md,
      marginVertical: spacing.xs,
      padding: spacing.xs,
      gap: spacing.xs,
      borderRadius: radii.xl,
      borderWidth: borders.hairline,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    shellFocused: { borderColor: colors.borderStrong },
    noOutline: { outlineStyle: 'none' } as object,
    reply: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.xxs,
    },
    replyText: {
      flex: 1,
      paddingLeft: spacing.xs,
      borderLeftWidth: borders.strong,
      borderLeftColor: colors.borderStrong,
    },
    cancel: {
      width: spacing.xl,
      height: spacing.xl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
    input: {
      flex: 1,
      minHeight: sizes.button.sm,
      maxHeight: LINE * MAX_LINES + spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xs,
      fontFamily: fontFamily.body,
      fontSize: typeScale.body.fontSize,
      lineHeight: LINE,
      color: colors.textPrimary,
      textAlignVertical: 'center',
    },
    send: {
      width: sizes.button.sm,
      height: sizes.button.sm,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inverseSurface,
    },
    sendDisabled: { opacity: 0.35 },
  }),
);
