import {
  pageSchema,
  sendResultSchema,
  type MessagePage,
  type ServerMessage,
} from '@/features/chat/model/chat';
import { supabase } from '@/lib/supabase';

/** How many messages one page holds (the server allows up to 100). */
export const PAGE_SIZE = 40;

/** One page, newest first; `null` when the conversation is no longer available to the caller. */
export async function fetchMessages(
  conversationId: string,
  before?: number,
): Promise<MessagePage | null> {
  const { data, error } = await supabase.rpc('get_messages', {
    p_conversation: conversationId,
    p_before: before,
    p_limit: PAGE_SIZE,
  });
  if (error) throw error;
  const page = pageSchema.parse(data);
  return page.ok ? page : null;
}

export type SendOutcome =
  | { ok: true; message: ServerMessage }
  | { ok: false; reason: 'not_available' | 'rate_limited' | 'invalid' };

/**
 * Sends one message. `clientId` identifies it on this device, so a retry after a dropped
 * connection is stored once. Throws only when the request itself failed (offline, timeout).
 */
export async function sendMessage(
  conversationId: string,
  body: string,
  clientId: string,
  replyTo: number | null,
): Promise<SendOutcome> {
  const { data, error } = await supabase.rpc('send_message', {
    p_conversation: conversationId,
    p_body: body,
    p_client_id: clientId,
    p_reply_to: replyTo ?? undefined,
  });
  if (error) throw error;
  const result = sendResultSchema.parse(data);
  if (result.ok) return { ok: true, message: result.message };
  return {
    ok: false,
    reason:
      result.reason === 'not_available' || result.reason === 'rate_limited'
        ? result.reason
        : 'invalid',
  };
}

/** Moves the caller's read position forward; the server never moves it back. */
export async function markRead(conversationId: string, messageId: number): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation: conversationId,
    p_message: messageId,
  });
  if (error) throw error;
}
