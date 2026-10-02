import {
  cleanDraft,
  dayLabel,
  deliveryLabel,
  fromServer,
  listTimeLabel,
  mergeMessages,
  messageSchema,
  newestFromOther,
  pendingMessage,
  previewText,
  timeLabel,
  toRows,
  type ChatMessage,
  type ServerMessage,
} from './chat';
import { conversationReducer, initialConversation } from './conversation-state';

const ME = '0000000a-0000-4000-8000-000000000001';
const THEM = '0000000a-0000-4000-8000-000000000002';
const CONVERSATION = '0000000c-0000-4000-8000-000000000001';

const server = (id: number, sender: string, over: Partial<ServerMessage> = {}): ServerMessage => ({
  id,
  conversation_id: CONVERSATION,
  sender_id: sender,
  body: `message ${id}`,
  client_id: `0000000b-0000-4000-8000-${String(id).padStart(12, '0')}`,
  created_at: new Date(2026, 9, 2, 10, id).toISOString(),
  reply_to: null,
  ...over,
});

const pending = (clientId: string, minute: number): ChatMessage =>
  pendingMessage({
    conversationId: CONVERSATION,
    senderId: ME,
    body: 'on its way',
    clientId,
    replyTo: null,
    now: new Date(2026, 9, 2, 11, minute),
  });

const page = (messages: ServerMessage[], over = {}) => ({
  ok: true as const,
  messages,
  has_more: false,
  my_read: 0,
  their_read: null,
  ...over,
});

describe('messages', () => {
  it('keeps stored messages in id order and pending ones after them', () => {
    const merged = mergeMessages(
      [fromServer(server(2, THEM)), pending('0000000d-0000-4000-8000-000000000002', 5)],
      [fromServer(server(1, ME)), pending('0000000d-0000-4000-8000-000000000001', 1)],
    );
    expect(merged.map((m) => m.id)).toEqual([1, 2, null, null]);
    expect(merged[2]!.client_id).toBe('0000000d-0000-4000-8000-000000000001');
  });

  it('replaces a pending message with the stored copy, and never the other way round', () => {
    const clientId = '0000000d-0000-4000-8000-000000000009';
    const stored = fromServer(server(7, ME, { client_id: clientId }));
    const afterStore = mergeMessages([pending(clientId, 1)], [stored]);
    expect(afterStore).toHaveLength(1);
    expect(afterStore[0]!.id).toBe(7);
    expect(mergeMessages(afterStore, [pending(clientId, 2)])[0]!.id).toBe(7);
  });

  it('labels the delivery of the newest own message', () => {
    expect(deliveryLabel(pending('0000000d-0000-4000-8000-000000000001', 1), null)).toBe(
      'Sending…',
    );
    expect(deliveryLabel(fromServer(server(5, ME)), null)).toBe('Sent');
    expect(deliveryLabel(fromServer(server(5, ME)), 4)).toBe('Sent');
    expect(deliveryLabel(fromServer(server(5, ME)), 5)).toBe('Read');
    expect(
      deliveryLabel(
        { ...pending('0000000d-0000-4000-8000-000000000001', 1), delivery: 'failed' },
        9,
      ),
    ).toBe('Not sent. Tap to try again.');
  });

  it('finds the newest message from the other person', () => {
    const list = [
      fromServer(server(1, THEM)),
      fromServer(server(2, ME)),
      fromServer(server(3, THEM)),
    ];
    expect(newestFromOther(list, ME)).toBe(3);
    expect(newestFromOther([fromServer(server(2, ME))], ME)).toBeNull();
  });

  it('accepts only drafts the server would accept', () => {
    expect(cleanDraft('  hi  ')).toBe('hi');
    expect(cleanDraft(' \n ')).toBeNull();
    expect(cleanDraft('x'.repeat(2001))).toBeNull();
  });

  it('parses a server message with a reply preview', () => {
    const parsed = messageSchema.parse(
      server(2, THEM, { reply_to: { id: 1, sender_id: ME, body: 'earlier' } }),
    );
    expect(parsed.reply_to?.body).toBe('earlier');
  });
});

describe('time', () => {
  const now = new Date(2026, 9, 2, 18, 0);

  it('formats clock time in 12-hour form', () => {
    expect(timeLabel(new Date(2026, 9, 2, 0, 5).toISOString())).toBe('12:05 am');
    expect(timeLabel(new Date(2026, 9, 2, 13, 42).toISOString())).toBe('1:42 pm');
  });

  it('names days relative to today', () => {
    expect(dayLabel(new Date(2026, 9, 2, 1).toISOString(), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 1, 23).toISOString(), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 8, 20).toISOString(), now)).toBe('20 Sep');
  });

  it('shows the time today and the day before that in the chat list', () => {
    expect(listTimeLabel(new Date(2026, 9, 2, 9, 30).toISOString(), now)).toBe('9:30 am');
    expect(listTimeLabel(new Date(2026, 9, 1, 9, 30).toISOString(), now)).toBe('Yesterday');
  });

  it('previews the last message on one line', () => {
    expect(previewText({ body: 'see you\nthere', mine: true })).toBe('You: see you there');
    expect(previewText({ body: 'ok', mine: false })).toBe('ok');
  });
});

describe('rows', () => {
  it("adds a day separator per calendar day and groups one person's run", () => {
    const rows = toRows(
      [
        fromServer(server(1, THEM, { created_at: new Date(2026, 9, 1, 22, 0).toISOString() })),
        fromServer(server(2, THEM, { created_at: new Date(2026, 9, 1, 22, 2).toISOString() })),
        fromServer(server(3, ME, { created_at: new Date(2026, 9, 1, 22, 3).toISOString() })),
        fromServer(server(4, ME, { created_at: new Date(2026, 9, 2, 9, 0).toISOString() })),
      ],
      ME,
      new Date(2026, 9, 2, 18),
    );
    expect(rows.map((row) => (row.kind === 'day' ? row.label : row.joinsPrevious))).toEqual([
      'Yesterday',
      false,
      true,
      false,
      'Today',
      false,
    ]);
    expect(
      rows.filter((row) => row.kind === 'message').map((row) => row.kind === 'message' && row.mine),
    ).toEqual([false, false, true, true]);
  });
});

describe('runs', () => {
  it('marks only the last message of a run as its end (where the time shows)', () => {
    const rows = toRows(
      [
        fromServer(server(1, THEM, { created_at: new Date(2026, 9, 2, 9, 0).toISOString() })),
        fromServer(server(2, THEM, { created_at: new Date(2026, 9, 2, 9, 1).toISOString() })),
        fromServer(server(3, THEM, { created_at: new Date(2026, 9, 2, 9, 30).toISOString() })),
        fromServer(server(4, ME, { created_at: new Date(2026, 9, 2, 9, 31).toISOString() })),
      ],
      ME,
      new Date(2026, 9, 2, 18),
    );
    expect(rows.flatMap((row) => (row.kind === 'message' ? [row.endsRun] : []))).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });
});

describe('conversation state', () => {
  const loaded = conversationReducer(initialConversation, {
    type: 'loaded',
    page: page([server(2, THEM), server(1, ME)], { has_more: true, my_read: 1, their_read: 1 }),
  });

  it('loads a page oldest first with both read positions', () => {
    expect(loaded.status).toBe('ready');
    expect(loaded.messages.map((m) => m.id)).toEqual([1, 2]);
    expect([loaded.hasMore, loaded.myRead, loaded.theirRead]).toEqual([true, 1, 1]);
  });

  it('shows a sent message at once, then swaps in the stored copy', () => {
    const clientId = '0000000d-0000-4000-8000-000000000003';
    const queued = conversationReducer(loaded, { type: 'queued', message: pending(clientId, 1) });
    expect(queued.messages.at(-1)!.delivery).toBe('sending');
    const stored = conversationReducer(queued, {
      type: 'stored',
      message: server(3, ME, { client_id: clientId }),
    });
    expect(stored.messages).toHaveLength(3);
    expect(stored.messages.at(-1)).toMatchObject({ id: 3, delivery: 'sent' });
    // The Realtime echo of the same message changes nothing.
    expect(
      conversationReducer(stored, {
        type: 'stored',
        message: server(3, ME, { client_id: clientId }),
      }).messages,
    ).toHaveLength(3);
  });

  it('marks a failed send and lets it be retried', () => {
    const clientId = '0000000d-0000-4000-8000-000000000004';
    const queued = conversationReducer(loaded, { type: 'queued', message: pending(clientId, 1) });
    const failed = conversationReducer(queued, { type: 'send-failed', clientId });
    expect(failed.messages.at(-1)!.delivery).toBe('failed');
    expect(
      conversationReducer(failed, { type: 'retrying', clientId }).messages.at(-1)!.delivery,
    ).toBe('sending');
  });

  it('only moves read positions forward', () => {
    const read = conversationReducer(loaded, { type: 'their-read', messageId: 2 });
    expect(read.theirRead).toBe(2);
    expect(conversationReducer(read, { type: 'their-read', messageId: 1 }).theirRead).toBe(2);
    expect(conversationReducer(loaded, { type: 'my-read', messageId: 0 }).myRead).toBe(1);
  });

  it('stops the typing indicator when their message arrives or the chat closes', () => {
    const typing = conversationReducer(loaded, { type: 'typing', typing: true });
    expect(
      conversationReducer(typing, { type: 'stored', message: server(3, THEM) }).otherTyping,
    ).toBe(false);
    const closed = conversationReducer(typing, { type: 'closed' });
    expect([closed.closed, closed.otherTyping]).toEqual([true, false]);
  });

  it('keeps showing messages when a refresh fails, and reports an empty failure', () => {
    expect(conversationReducer(loaded, { type: 'load-failed' }).status).toBe('ready');
    expect(conversationReducer(initialConversation, { type: 'load-failed' }).status).toBe('error');
  });

  it('adds older pages in front without disturbing newer messages', () => {
    const newer = conversationReducer(initialConversation, {
      type: 'loaded',
      page: page([server(4, THEM), server(3, ME)], { has_more: true }),
    });
    const older = conversationReducer(conversationReducer(newer, { type: 'loading-older' }), {
      type: 'older-loaded',
      page: page([server(2, THEM), server(1, ME)]),
    });
    expect(older.messages.map((m) => m.id)).toEqual([1, 2, 3, 4]);
    expect([older.hasMore, older.loadingOlder]).toEqual([false, false]);
  });
});
