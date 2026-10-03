import { act, renderHook, waitFor } from '@testing-library/react-native';

import { fetchMessages } from '@/features/chat/api/chat';
import { joinConversation } from '@/features/chat/api/realtime';

import { useConversation } from './use-conversation';

jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
jest.mock('@/features/chat/api/chat', () => ({
  fetchMessages: jest.fn(),
  markRead: jest.fn(),
  sendMessage: jest.fn(),
}));
jest.mock('@/features/chat/api/realtime', () => ({ joinConversation: jest.fn() }));
jest.mock('@/features/matching/api/matches', () => ({ refreshMatches: jest.fn() }));

const fetchMock = jest.mocked(fetchMessages);
const joinMock = jest.mocked(joinConversation);
const CONVERSATION = '00000000-0000-4000-8000-0000000000c1';
const USER = '00000000-0000-4000-8000-0000000000a1';
const page = { ok: true as const, messages: [], has_more: false, my_read: 0, their_read: null };

let leave: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  leave = jest.fn();
  joinMock.mockReturnValue({ sendTyping: jest.fn(), leave });
});

describe('useConversation and its live topics', () => {
  it('joins an open conversation once', async () => {
    fetchMock.mockResolvedValue(page);
    await renderHook(() => useConversation(CONVERSATION, USER));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(joinMock).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();
  });

  // A refused channel keeps retrying and delays the socket's other topics (Phase 18).
  it('leaves the topics when the conversation ends, and does not join again', async () => {
    fetchMock.mockResolvedValue(page);
    await renderHook(() => useConversation(CONVERSATION, USER));
    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
    const handlers = joinMock.mock.calls[0]?.[1];
    await act(async () => handlers?.onClosed());
    expect(leave).toHaveBeenCalledTimes(1);
    expect(joinMock).toHaveBeenCalledTimes(1);
  });

  it('stays off the topics of a conversation the server says is unavailable', async () => {
    fetchMock.mockResolvedValue(null);
    const { result } = await renderHook(() => useConversation(CONVERSATION, USER));
    await waitFor(() => expect(result.current.state.status).toBe('unavailable'));
    expect(leave).toHaveBeenCalledTimes(1);
    expect(joinMock).toHaveBeenCalledTimes(1);
  });
});
