import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardInset } from '@/components/keyboard-inset';
import { PressableScale } from '@/components/pressable-scale';
import { SoulIcon } from '@/components/soul-icon';
import { SoulAvatar } from '@/components/soul-photo';
import { SoulText } from '@/components/soul-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { Composer } from '@/features/chat/components/composer';
import { MessageBubble } from '@/features/chat/components/message-bubble';
import { TypingIndicator } from '@/features/chat/components/typing-indicator';
import { useConversation } from '@/features/chat/hooks/use-conversation';
import {
  deliveryLabel,
  toRows,
  type ChatMessage,
  type ChatRow,
  type ReplyTarget,
} from '@/features/chat/model/chat';
import { cardBucket, type DiscoveryCard } from '@/features/discovery/model/card';
import { useMatches } from '@/features/matching/api/matches';
import { matchedLabel, personName } from '@/features/matching/model/match';
import { usePhotoUrls } from '@/features/profile/api/profile';
import { createThemedStyles, layout, sizes, spacing, useTheme } from '@/theme';

/** How much of the row a bubble may take. */
const BUBBLE_SHARE = 0.82;

/** Within this many points of the newest message counts as "reading the latest". */
const NEAR_BOTTOM = 120;

function backToChats() {
  if (router.canGoBack()) router.back();
  else router.replace('/chats');
}

/**
 * One conversation (spec 25). The match list tells us who this is; the server re-checks
 * access on every read, send and Realtime join.
 */
export function ChatScreen({ id }: { id: string }) {
  const userId = useCurrentUserId();
  const matches = useMatches(userId);
  const match = matches.data?.find((item) => item.conversation_id === id) ?? null;

  if (matches.isPending) return <LoadingState />;
  if (matches.isError && !match) {
    return (
      <ErrorState
        title="Couldn't open this chat"
        body="Check your connection and try again."
        onRetry={() => void matches.refetch()}
      />
    );
  }
  if (!match || !userId) {
    return (
      <EmptyState
        icon="chat_bubble"
        title="This conversation isn't available"
        body="The match may have ended."
        action={{ label: 'Back to chats', onPress: backToChats }}
      />
    );
  }
  return (
    <Conversation
      conversationId={id}
      person={match.person}
      userId={userId}
      caption={matchedLabel(match.created_at)}
      onBack={backToChats}
      onOpenProfile={() =>
        router.push({ pathname: '/profile/[id]', params: { id: match.person.id } })
      }
    />
  );
}

type ConversationProps = {
  conversationId: string;
  /** The other person, as the server's whitelisted card. */
  person: DiscoveryCard;
  userId: string;
  /** Under "Say hello" in an empty conversation. */
  caption: string;
  onBack: () => void;
  onOpenProfile?: () => void;
  /** Extra controls at the end of the header (Instant Meet: distance and End Meet). */
  headerAccessory?: ReactNode;
};

/**
 * The conversation itself, shared by match chats and Instant Meet session chats. The server
 * decides access for every read, send and Realtime join.
 */
export function Conversation({
  conversationId,
  person,
  userId,
  caption,
  onBack,
  onOpenProfile,
  headerAccessory,
}: ConversationProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const { width } = useWindowDimensions();
  const bubbleMax = Math.floor((width - layout.screenGutter * 2) * BUBBLE_SHARE);
  const name = personName(person);
  const photoPath = person.photos[0]!.path;
  const photo = usePhotoUrls(cardBucket(person), [photoPath]);
  const { state, send, retry, loadOlder, noteTyping, reload } = useConversation(
    conversationId,
    userId,
  );
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const list = useRef<FlashListRef<ChatRow>>(null);
  const nearBottom = useRef(true);

  // The typing bubble is the list's footer. Bring it into view when it appears, but only
  // for someone already reading the newest messages (never yank a person out of history).
  useEffect(() => {
    if (!state.otherTyping || !nearBottom.current) return;
    const timer = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [state.otherTyping]);

  const rows = toRows(state.messages, userId);
  // The delivery line belongs to the caller's newest message only.
  const lastOwn = [...state.messages].reverse().find((message) => message.sender_id === userId);
  const status = lastOwn ? deliveryLabel(lastOwn, state.theirRead) : null;

  function reply(message: ChatMessage) {
    if (message.id == null) return;
    setReplyTo({ id: message.id, sender_id: message.sender_id, body: message.body });
  }

  function submit(body: string) {
    send(body, replyTo);
    setReplyTo(null);
  }

  function renderRow({ item }: { item: ChatRow }) {
    if (item.kind === 'day') {
      return (
        <SoulText variant="micro" tone="tertiary" align="center" style={styles.day}>
          {item.label.toUpperCase()}
        </SoulText>
      );
    }
    return (
      <MessageBubble
        row={item}
        otherName={name}
        maxWidth={bubbleMax}
        status={lastOwn && item.message.client_id === lastOwn.client_id ? status : null}
        onReply={reply}
        onRetry={retry}
      />
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: keyboardInset }]}>
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.back}>
          <SoulIcon name="arrow_back" size="md" />
        </PressableScale>
        <Pressable
          accessibilityRole={onOpenProfile ? 'button' : undefined}
          accessibilityLabel={onOpenProfile ? `${name}. Open profile` : name}
          disabled={!onOpenProfile}
          onPress={onOpenProfile}
          style={styles.person}>
          <SoulAvatar
            size="sm"
            source={photo.data?.[photoPath] ? { uri: photo.data[photoPath] } : null}
            blurRadius={person.anonymous ? sizes.anonymousBlur : undefined}
          />
          <SoulText variant="label" numberOfLines={1} style={styles.name}>
            {name}
          </SoulText>
        </Pressable>
        {headerAccessory}
      </View>

      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={-insets.bottom}
        style={styles.body}>
        {state.status === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textSecondary} accessibilityLabel="Loading messages" />
          </View>
        ) : state.status === 'error' ? (
          <ErrorState
            title="Couldn't load messages"
            body="Check your connection and try again."
            onRetry={reload}
          />
        ) : rows.length === 0 && !state.closed ? (
          <View style={styles.center}>
            <SoulText variant="subheading" italic align="center" style={styles.stretch}>
              Say hello to {name}
            </SoulText>
            <SoulText variant="supporting" tone="tertiary" align="center" style={styles.stretch}>
              {caption}
            </SoulText>
          </View>
        ) : (
          <FlashList
            ref={list}
            data={rows}
            onScroll={({ nativeEvent }) => {
              const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
              nearBottom.current =
                contentSize.height - (contentOffset.y + layoutMeasurement.height) < NEAR_BOTTOM;
            }}
            scrollEventThrottle={64}
            renderItem={renderRow}
            keyExtractor={(row) => row.key}
            getItemType={(row) => row.kind}
            // Changes to the delivery line re-render the row it belongs to.
            extraData={`${status}:${lastOwn?.client_id}`}
            maintainVisibleContentPosition={{
              startRenderingFromBottom: true,
              autoscrollToBottomThreshold: 0.3,
            }}
            onStartReached={() => void loadOlder()}
            onStartReachedThreshold={0.4}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              state.loadingOlder ? (
                <ActivityIndicator
                  color={colors.textSecondary}
                  accessibilityLabel="Loading earlier messages"
                  style={styles.older}
                />
              ) : null
            }
            ListFooterComponent={state.otherTyping ? <TypingIndicator name={name} /> : null}
          />
        )}

        <View style={{ paddingBottom: insets.bottom }}>
          {state.notice ? (
            <SoulText variant="supporting" align="center" role="alert" style={styles.notice}>
              {state.notice}
            </SoulText>
          ) : null}
          {state.closed ? (
            <SoulText variant="supporting" tone="secondary" align="center" style={styles.closed}>
              This conversation has ended.
            </SoulText>
          ) : (
            <Composer
              replyingTo={
                replyTo
                  ? { target: replyTo, name: replyTo.sender_id === userId ? 'yourself' : name }
                  : null
              }
              onCancelReply={() => setReplyTo(null)}
              onSend={submit}
              onTyping={noteTyping}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    back: {
      width: sizes.touchTarget,
      height: sizes.touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
    },
    person: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: sizes.touchTarget,
    },
    name: { flex: 1 },
    body: { flex: 1 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: layout.screenGutter,
    },
    // Full width: shrink-wrapped centred serif text can lose its last word on Android.
    stretch: { alignSelf: 'stretch' },
    list: { paddingHorizontal: layout.screenGutter, paddingBottom: spacing.sm },
    day: { marginTop: spacing.lg },
    older: { marginTop: spacing.md },
    notice: { paddingHorizontal: layout.screenGutter, paddingTop: spacing.xs },
    closed: { padding: spacing.lg },
  }),
);
