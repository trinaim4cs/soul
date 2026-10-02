import {
  fromServer,
  mergeMessages,
  setDelivery,
  type ChatMessage,
  type MessagePage,
  type ServerMessage,
} from './chat';

export type ConversationState = {
  status: 'loading' | 'ready' | 'error' | 'unavailable';
  /** Oldest first. */
  messages: ChatMessage[];
  hasMore: boolean;
  loadingOlder: boolean;
  /** How far the other person has read; null when read receipts are not shared. */
  theirRead: number | null;
  myRead: number;
  otherTyping: boolean;
  /** The match ended while the chat was open. */
  closed: boolean;
  notice: string | null;
};

export const initialConversation: ConversationState = {
  status: 'loading',
  messages: [],
  hasMore: false,
  loadingOlder: false,
  theirRead: null,
  myRead: 0,
  otherTyping: false,
  closed: false,
  notice: null,
};

export type ConversationAction =
  | { type: 'loaded'; page: MessagePage }
  | { type: 'refreshed'; page: MessagePage }
  | { type: 'load-failed' }
  | { type: 'unavailable' }
  | { type: 'loading-older' }
  | { type: 'older-loaded'; page: MessagePage }
  | { type: 'older-failed' }
  | { type: 'queued'; message: ChatMessage }
  | { type: 'stored'; message: ServerMessage }
  | { type: 'send-failed'; clientId: string; notice?: string }
  | { type: 'retrying'; clientId: string }
  | { type: 'their-read'; messageId: number }
  | { type: 'my-read'; messageId: number }
  | { type: 'typing'; typing: boolean }
  | { type: 'closed' }
  | { type: 'notice'; notice: string | null };

const fromPage = (page: MessagePage) => page.messages.map(fromServer);

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        status: 'ready',
        messages: mergeMessages(state.messages, fromPage(action.page)),
        hasMore: action.page.has_more,
        theirRead: action.page.their_read,
        myRead: action.page.my_read,
      };
    case 'refreshed':
      // After a reconnect: fill in what was missed, keep the paging position.
      return {
        ...state,
        status: 'ready',
        messages: mergeMessages(state.messages, fromPage(action.page)),
        theirRead: action.page.their_read,
        myRead: Math.max(state.myRead, action.page.my_read),
      };
    case 'load-failed':
      return state.messages.length > 0 ? state : { ...state, status: 'error' };
    case 'unavailable':
      return { ...state, status: 'unavailable', closed: true };
    case 'loading-older':
      return { ...state, loadingOlder: true };
    case 'older-loaded':
      return {
        ...state,
        loadingOlder: false,
        hasMore: action.page.has_more,
        messages: mergeMessages(state.messages, fromPage(action.page)),
      };
    case 'older-failed':
      return { ...state, loadingOlder: false };
    case 'queued':
      return {
        ...state,
        notice: null,
        messages: mergeMessages(state.messages, [action.message]),
      };
    case 'stored':
      return {
        ...state,
        // A message from the other person means they have stopped typing.
        otherTyping: false,
        messages: mergeMessages(state.messages, [fromServer(action.message)]),
      };
    case 'send-failed':
      return {
        ...state,
        notice: action.notice ?? state.notice,
        messages: setDelivery(state.messages, action.clientId, 'failed'),
      };
    case 'retrying':
      return { ...state, messages: setDelivery(state.messages, action.clientId, 'sending') };
    case 'their-read':
      return { ...state, theirRead: Math.max(state.theirRead ?? 0, action.messageId) };
    case 'my-read':
      return { ...state, myRead: Math.max(state.myRead, action.messageId) };
    case 'typing':
      return state.otherTyping === action.typing ? state : { ...state, otherTyping: action.typing };
    case 'closed':
      return { ...state, closed: true, otherTyping: false };
    case 'notice':
      return { ...state, notice: action.notice };
  }
}
