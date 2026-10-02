import { z } from 'zod';

/** A stored message as `send_message`, `get_messages` and the Realtime broadcast return it. */
export const messageSchema = z.object({
  id: z.number().int().positive(),
  conversation_id: z.string().uuid(),
  sender_id: z.string().uuid(),
  body: z.string(),
  client_id: z.string().uuid(),
  created_at: z.string(),
  reply_to: z
    .object({ id: z.number().int(), sender_id: z.string().uuid(), body: z.string() })
    .nullable(),
});
export type ServerMessage = z.infer<typeof messageSchema>;

export const pageSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    messages: z.array(messageSchema),
    has_more: z.boolean(),
    my_read: z.number().int(),
    /** null when read receipts are not shared (either person turned them off). */
    their_read: z.number().int().nullable(),
  }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type MessagePage = Extract<z.infer<typeof pageSchema>, { ok: true }>;

export const sendResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), replayed: z.boolean(), message: messageSchema }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export const MAX_MESSAGE_LENGTH = 2000;

/**
 * A message on screen. Until the server confirms it, a message this device sent has no id
 * and is `sending` (or `failed`, waiting for a retry with the same `client_id`).
 */
export type ChatMessage = Omit<ServerMessage, 'id'> & {
  id: number | null;
  delivery: 'sending' | 'failed' | 'sent';
};

export type ReplyTarget = { id: number; sender_id: string; body: string };

export function fromServer(message: ServerMessage): ChatMessage {
  return { ...message, delivery: 'sent' };
}

/** The message a device is about to send, shown at once. */
export function pendingMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  clientId: string;
  replyTo: ReplyTarget | null;
  now?: Date;
}): ChatMessage {
  return {
    id: null,
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    body: input.body,
    client_id: input.clientId,
    created_at: (input.now ?? new Date()).toISOString(),
    reply_to: input.replyTo ? { ...input.replyTo, body: input.replyTo.body.slice(0, 140) } : null,
    delivery: 'sending',
  };
}

/**
 * Adds or replaces messages by `client_id` (the server's copy replaces the pending one) and
 * keeps the list oldest first: stored messages by id, then anything still pending in the
 * order it was written.
 */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byClient = new Map<string, ChatMessage>();
  for (const message of current) byClient.set(message.client_id, message);
  for (const message of incoming) {
    const existing = byClient.get(message.client_id);
    // A stored copy is never replaced by a pending or failed one.
    if (existing?.id != null && message.id == null) continue;
    byClient.set(message.client_id, message);
  }
  return [...byClient.values()].sort((a, b) => {
    if (a.id != null && b.id != null) return a.id - b.id;
    if (a.id != null) return -1;
    if (b.id != null) return 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

export function setDelivery(
  messages: ChatMessage[],
  clientId: string,
  delivery: ChatMessage['delivery'],
): ChatMessage[] {
  return messages.map((message) =>
    message.client_id === clientId && message.id == null ? { ...message, delivery } : message,
  );
}

export type DeliveryLabel = 'Sending…' | 'Sent' | 'Read' | 'Not sent. Tap to try again.';

/** The status line under the caller's newest message. `theirRead` is null when receipts are off. */
export function deliveryLabel(message: ChatMessage, theirRead: number | null): DeliveryLabel {
  if (message.delivery === 'failed') return 'Not sent. Tap to try again.';
  if (message.id == null) return 'Sending…';
  return theirRead != null && theirRead >= message.id ? 'Read' : 'Sent';
}

/** The newest stored message from the other person, which is what "read" means. */
export function newestFromOther(messages: ChatMessage[], me: string): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.id != null && message.sender_id !== me) return message.id;
  }
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** "10:42 am" in the device's own time zone. */
export function timeLabel(iso: string): string {
  const date = new Date(iso);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
}

/** "Today", "Yesterday", then "2 Oct". */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** For the chat list: the time today, otherwise the day. */
export function listTimeLabel(iso: string, now: Date = new Date()): string {
  const day = dayLabel(iso, now);
  return day === 'Today' ? timeLabel(iso) : day;
}

export type ChatRow =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      message: ChatMessage;
      mine: boolean;
      /** Continues the same person's run: tighter spacing above. */
      joinsPrevious: boolean;
      /** Last of its run: the time is shown under it. */
      endsRun: boolean;
    };

/** Minutes within which consecutive messages from one person read as one group. */
const GROUP_MINUTES = 5;

/**
 * Rows for the list, oldest first: a day separator whenever the calendar day changes, and
 * `joinsPrevious` when a message continues the same person's run (tighter spacing).
 */
export function toRows(messages: ChatMessage[], me: string, now: Date = new Date()): ChatRow[] {
  const rows: ChatRow[] = [];
  let previous: ChatMessage | null = null;
  for (const message of messages) {
    const day = startOfDay(new Date(message.created_at));
    const newDay = !previous || startOfDay(new Date(previous.created_at)) !== day;
    if (newDay)
      rows.push({ kind: 'day', key: `day-${day}`, label: dayLabel(message.created_at, now) });
    const joinsPrevious =
      !newDay &&
      previous !== null &&
      previous.sender_id === message.sender_id &&
      new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() <
        GROUP_MINUTES * 60_000;
    const last = rows.at(-1);
    if (last?.kind === 'message' && joinsPrevious) last.endsRun = false;
    rows.push({
      kind: 'message',
      key: message.client_id,
      message,
      mine: message.sender_id === me,
      joinsPrevious,
      endsRun: true,
    });
    previous = message;
  }
  return rows;
}

/** One line for the chat list: "You: see you there" or "see you there". */
export function previewText(last: { body: string; mine: boolean }): string {
  const body = last.body.replace(/\s+/g, ' ').trim();
  return last.mine ? `You: ${body}` : body;
}

/** What the composer may send: trimmed, not empty, within the server's limit. */
export function cleanDraft(draft: string): string | null {
  const body = draft.trim();
  return body.length === 0 || body.length > MAX_MESSAGE_LENGTH ? null : body;
}
