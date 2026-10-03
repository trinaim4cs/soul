import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { fetchMessages, markRead, sendMessage } from '@/features/chat/api/chat';
import { joinConversation, type ConversationConnection } from '@/features/chat/api/realtime';
import {
  newestFromOther,
  pendingMessage,
  type ChatMessage,
  type ReplyTarget,
} from '@/features/chat/model/chat';
import { conversationReducer, initialConversation } from '@/features/chat/model/conversation-state';
import { refreshMatches } from '@/features/matching/api/matches';

/** The other person's "typing" disappears after this long without another signal. */
const TYPING_SHOWN_MS = 5000;
/** How long this device keeps saying "typing" after the last keystroke. */
const TYPING_IDLE_MS = 3000;
/** While still typing, the signal is repeated this often so it does not time out. */
const TYPING_REPEAT_MS = 2500;

/**
 * One open conversation: history, live messages, optimistic sending with retry, read
 * positions and typing. The server stores and authorizes everything; this only mirrors it.
 */
export function useConversation(conversationId: string, userId: string | null) {
  const [state, dispatch] = useReducer(conversationReducer, initialConversation);
  const connection = useRef<ConversationConnection | null>(null);
  const typingShown = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSent = useRef(false);
  const typingSentAt = useRef(0);

  const load = useCallback(
    async (kind: 'loaded' | 'refreshed') => {
      try {
        const page = await fetchMessages(conversationId);
        if (page) dispatch({ type: kind, page });
        else dispatch({ type: 'unavailable' });
      } catch {
        dispatch({ type: 'load-failed' });
      }
    },
    [conversationId],
  );

  useEffect(() => {
    void load('loaded');
  }, [load]);

  // Once the conversation has ended the server refuses its topics, and a refused channel keeps
  // retrying, which holds back the account's other live updates on the same socket by up to
  // 10 s (Phase 18). Nothing more can arrive on an ended conversation, so leave it.
  const closed = state.closed;
  useEffect(() => {
    if (!userId || closed) return;
    const joined = joinConversation(conversationId, {
      onMessage: (message) => dispatch({ type: 'stored', message }),
      onRead: (reader, messageId) => {
        if (reader !== userId) dispatch({ type: 'their-read', messageId });
      },
      onClosed: () => dispatch({ type: 'closed' }),
      onTyping: (typing) => {
        if (typingShown.current) clearTimeout(typingShown.current);
        dispatch({ type: 'typing', typing });
        if (typing) {
          typingShown.current = setTimeout(
            () => dispatch({ type: 'typing', typing: false }),
            TYPING_SHOWN_MS,
          );
        }
      },
      onReconnect: () => void load('refreshed'),
    });
    connection.current = joined;
    return () => {
      connection.current = null;
      joined.leave();
      if (typingShown.current) clearTimeout(typingShown.current);
      if (typingIdle.current) clearTimeout(typingIdle.current);
    };
  }, [conversationId, userId, load, closed]);

  // Reading: whenever a newer message from the other person is on screen, tell the server.
  const newest = userId ? newestFromOther(state.messages, userId) : null;
  useEffect(() => {
    if (!userId || newest == null || newest <= state.myRead || state.closed) return;
    dispatch({ type: 'my-read', messageId: newest });
    void markRead(conversationId, newest)
      .then(() => refreshMatches(userId))
      .catch(() => {});
  }, [conversationId, userId, newest, state.myRead, state.closed]);

  const deliver = useCallback(
    async (message: ChatMessage) => {
      try {
        const outcome = await sendMessage(
          conversationId,
          message.body,
          message.client_id,
          message.reply_to?.id ?? null,
        );
        if (outcome.ok) {
          dispatch({ type: 'stored', message: outcome.message });
          if (userId) void refreshMatches(userId);
        } else if (outcome.reason === 'not_available') {
          dispatch({ type: 'send-failed', clientId: message.client_id });
          dispatch({ type: 'closed' });
        } else {
          dispatch({
            type: 'send-failed',
            clientId: message.client_id,
            notice:
              outcome.reason === 'rate_limited'
                ? "You're sending messages very quickly. Wait a moment and try again."
                : "That message couldn't be sent.",
          });
        }
      } catch {
        dispatch({ type: 'send-failed', clientId: message.client_id });
      }
    },
    [conversationId, userId],
  );

  const stopTyping = useCallback(() => {
    if (typingIdle.current) clearTimeout(typingIdle.current);
    if (typingSent.current) {
      typingSent.current = false;
      connection.current?.sendTyping(false);
    }
  }, []);

  const send = useCallback(
    (body: string, replyTo: ReplyTarget | null) => {
      if (!userId) return;
      stopTyping();
      const message = pendingMessage({
        conversationId,
        senderId: userId,
        body,
        clientId: randomUUID(),
        replyTo,
      });
      dispatch({ type: 'queued', message });
      void deliver(message);
    },
    [conversationId, userId, deliver, stopTyping],
  );

  const retry = useCallback(
    (message: ChatMessage) => {
      if (message.id != null || message.delivery !== 'failed') return;
      dispatch({ type: 'retrying', clientId: message.client_id });
      void deliver(message);
    },
    [deliver],
  );

  const loadOlder = useCallback(async () => {
    const oldest = state.messages.find((message) => message.id != null)?.id;
    if (!state.hasMore || state.loadingOlder || oldest == null) return;
    dispatch({ type: 'loading-older' });
    try {
      const page = await fetchMessages(conversationId, oldest);
      if (page) dispatch({ type: 'older-loaded', page });
      else dispatch({ type: 'unavailable' });
    } catch {
      dispatch({ type: 'older-failed' });
    }
  }, [conversationId, state.messages, state.hasMore, state.loadingOlder]);

  /** Called on every draft change: says "typing" once, and "stopped" after a pause. */
  const noteTyping = useCallback(
    (hasText: boolean) => {
      if (!hasText) {
        stopTyping();
        return;
      }
      const now = Date.now();
      if (!typingSent.current || now - typingSentAt.current > TYPING_REPEAT_MS) {
        typingSent.current = true;
        typingSentAt.current = now;
        connection.current?.sendTyping(true);
      }
      if (typingIdle.current) clearTimeout(typingIdle.current);
      typingIdle.current = setTimeout(stopTyping, TYPING_IDLE_MS);
    },
    [stopTyping],
  );

  return {
    state,
    send,
    retry,
    loadOlder,
    noteTyping,
    reload: () => void load('loaded'),
    clearNotice: () => dispatch({ type: 'notice', notice: null }),
  };
}
