import type { RealtimeChannel } from '@supabase/supabase-js';
import { z } from 'zod';

import { messageSchema, type ServerMessage } from '@/features/chat/model/chat';
import { supabase } from '@/lib/supabase';

// Private Realtime topics (DECISIONS D-012, D-049). The server authorizes every join:
//   chat:<conversation>    server to clients: `message`, `read`, `closed`
//   typing:<conversation>  client to client: typing only
//   user:<account>         server to that account: `refresh`
// Clients cannot publish on `chat:` or `user:`, so what arrives there was stored by the server.

const readSchema = z.object({ user_id: z.string().uuid(), message_id: z.number().int() });
const typingSchema = z.object({ typing: z.boolean() });

type ConversationHandlers = {
  onMessage: (message: ServerMessage) => void;
  onRead: (userId: string, messageId: number) => void;
  onClosed: () => void;
  onTyping: (typing: boolean) => void;
  /** The socket came back after a drop: anything sent meanwhile was missed. */
  onReconnect: () => void;
};

export type ConversationConnection = {
  sendTyping: (typing: boolean) => void;
  leave: () => void;
};

/** Makes sure the socket carries the signed-in user's token before a private join. */
async function authorize() {
  await supabase.realtime.setAuth();
}

export function joinConversation(
  conversationId: string,
  handlers: ConversationHandlers,
): ConversationConnection {
  let left = false;
  let joinedOnce = false;
  let chat: RealtimeChannel | null = null;
  let typing: RealtimeChannel | null = null;
  let typingReady = false;

  void authorize().then(() => {
    if (left) return;
    chat = supabase
      .channel(`chat:${conversationId}`, { config: { private: true } })
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        const message = messageSchema.safeParse(payload);
        if (message.success) handlers.onMessage(message.data);
      })
      .on('broadcast', { event: 'read' }, ({ payload }) => {
        const read = readSchema.safeParse(payload);
        if (read.success) handlers.onRead(read.data.user_id, read.data.message_id);
      })
      .on('broadcast', { event: 'closed' }, () => handlers.onClosed())
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (joinedOnce) handlers.onReconnect();
        joinedOnce = true;
      });
    typing = supabase
      .channel(`typing:${conversationId}`, { config: { private: true } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const state = typingSchema.safeParse(payload);
        if (state.success) handlers.onTyping(state.data.typing);
      })
      .subscribe((status) => {
        typingReady = status === 'SUBSCRIBED';
      });
  });

  return {
    sendTyping(isTyping) {
      if (!typing || !typingReady) return;
      void typing.send({ type: 'broadcast', event: 'typing', payload: { typing: isTyping } });
    },
    leave() {
      left = true;
      if (chat) void supabase.removeChannel(chat);
      if (typing) void supabase.removeChannel(typing);
    },
  };
}

/** The account's own topic: a nudge whenever a match or a message changes its chat list. */
export function joinAccount(userId: string, onRefresh: () => void): () => void {
  let left = false;
  let channel: RealtimeChannel | null = null;
  let joinedOnce = false;
  void authorize().then(() => {
    if (left) return;
    channel = supabase
      .channel(`user:${userId}`, { config: { private: true } })
      .on('broadcast', { event: 'refresh' }, () => onRefresh())
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        // After a reconnect, catch up on anything missed while offline.
        if (joinedOnce) onRefresh();
        joinedOnce = true;
      });
  });
  return () => {
    left = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
