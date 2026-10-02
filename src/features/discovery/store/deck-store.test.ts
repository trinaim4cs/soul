import type { DiscoveryCard } from '@/features/discovery/model/card';

import { useDeckStore } from './deck-store';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'key' }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/discovery/api/discovery', () => ({
  FEED_PAGE_SIZE: 3,
  fetchFeed: jest.fn(),
  swipeLeft: jest.fn(),
  swipeRight: jest.fn(),
}));

jest.mock('@/features/swipes/api/swipes', () => ({
  refreshSwipes: jest.fn(),
  setServerBalance: jest.fn(),
  spendOneLocally: jest.fn(),
}));

jest.mock('@/features/matching/api/matches', () => ({ refreshMatches: jest.fn() }));

const matching = jest.requireMock('@/features/matching/api/matches') as {
  refreshMatches: jest.Mock;
};
const swipes = jest.requireMock('@/features/swipes/api/swipes') as {
  refreshSwipes: jest.Mock;
  setServerBalance: jest.Mock;
  spendOneLocally: jest.Mock;
};
const api = jest.requireMock('@/features/discovery/api/discovery') as {
  fetchFeed: jest.Mock;
  swipeLeft: jest.Mock;
  swipeRight: jest.Mock;
};

function card(n: number): DiscoveryCard {
  return {
    id: `0000000f-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name: `Profile ${String(n).padStart(2, '0')}`,
    anonymous: false,
    gender: 'man',
    age: 22,
    verified: true,
    hook: null,
    about: null,
    zodiac: null,
    hot_person: false,
    photos: [{ bucket: 'profile-photos', path: `${n}/1.jpg` }],
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.resetAllMocks();
  useDeckStore.getState().reset();
});

describe('discovery deck', () => {
  it('loads the first page', async () => {
    api.fetchFeed.mockResolvedValueOnce({ ok: true, cards: [card(1), card(2), card(3)] });
    useDeckStore.getState().start('viewer');
    await flush();
    const state = useDeckStore.getState();
    expect(state.status).toBe('ready');
    expect(state.cards.map((c) => c.name)).toEqual(['Profile 01', 'Profile 02', 'Profile 03']);
    expect(state.exhausted).toBe(false);
  });

  it('removes a card at once, saves it, and pages before running out', async () => {
    api.fetchFeed
      .mockResolvedValueOnce({ ok: true, cards: [card(1), card(2), card(3)] })
      .mockResolvedValueOnce({ ok: true, cards: [card(4)] });
    api.swipeRight.mockResolvedValue({ ok: true, liked: true, replayed: false, balance: 3 });
    useDeckStore.getState().start('viewer');
    await flush();

    const promise = useDeckStore.getState().decide(card(1), 'like');
    expect(useDeckStore.getState().cards.map((c) => c.id)).not.toContain(card(1).id);
    await promise;
    await flush();

    expect(api.swipeRight).toHaveBeenCalledWith(card(1).id);
    const exclude = api.fetchFeed.mock.calls[1]![0] as string[];
    expect(exclude).toEqual(expect.arrayContaining([card(1).id, card(2).id, card(3).id]));
    expect(useDeckStore.getState().cards.map((c) => c.id)).toEqual([
      card(2).id,
      card(3).id,
      card(4).id,
    ]);
    expect(useDeckStore.getState().exhausted).toBe(true);
  });

  it('puts the card back on top when saving fails', async () => {
    api.fetchFeed
      .mockResolvedValueOnce({ ok: true, cards: [card(1), card(2), card(3)] })
      .mockResolvedValue({ ok: true, cards: [] });
    api.swipeLeft.mockRejectedValueOnce(new Error('network'));
    useDeckStore.getState().start('viewer');
    await flush();

    await useDeckStore.getState().decide(card(1), 'pass');
    const state = useDeckStore.getState();
    expect(state.cards[0]!.id).toBe(card(1).id);
    expect(state.decided[card(1).id]).toBeUndefined();
    expect(state.message).toMatch(/Couldn't save/);
  });

  it('reports an empty deck when nothing is left', async () => {
    api.fetchFeed
      .mockResolvedValueOnce({ ok: true, cards: [card(1)] })
      .mockResolvedValue({ ok: true, cards: [] });
    api.swipeRight.mockResolvedValue({ ok: true, liked: true, replayed: false, balance: 3 });
    useDeckStore.getState().start('viewer');
    await flush();
    expect(useDeckStore.getState().exhausted).toBe(true);
    await useDeckStore.getState().decide(card(1), 'like');
    await flush();
    expect(useDeckStore.getState().status).toBe('empty');
  });

  it('shows loading, not "all caught up", while the next page is still on its way', async () => {
    let resolvePage: (value: unknown) => void = () => {};
    api.fetchFeed
      .mockResolvedValueOnce({ ok: true, cards: [card(1), card(2), card(3)] })
      .mockImplementationOnce(() => new Promise((resolve) => (resolvePage = resolve)));
    api.swipeRight.mockResolvedValue({ ok: true, liked: true, replayed: false, balance: 3 });
    useDeckStore.getState().start('viewer');
    await flush();

    for (const n of [1, 2, 3]) await useDeckStore.getState().decide(card(n), 'like');
    expect(useDeckStore.getState().cards).toEqual([]);
    expect(useDeckStore.getState().status).toBe('loading');

    resolvePage({ ok: true, cards: [card(4)] });
    await flush();
    expect(useDeckStore.getState().status).toBe('ready');
    expect(useDeckStore.getState().cards.map((c) => c.id)).toEqual([card(4).id]);
  });

  it('shows a like in the balance at once, then takes the server balance', async () => {
    api.fetchFeed.mockResolvedValue({ ok: true, cards: [card(1), card(2)] });
    api.swipeRight.mockResolvedValue({ ok: true, liked: true, replayed: false, balance: 2 });
    useDeckStore.getState().start('viewer');
    await flush();

    const promise = useDeckStore.getState().decide(card(1), 'like');
    expect(swipes.spendOneLocally).toHaveBeenCalledWith('viewer');
    await promise;
    expect(swipes.setServerBalance).toHaveBeenCalledWith('viewer', 2);
  });

  it('does not touch the balance for a pass', async () => {
    api.fetchFeed.mockResolvedValue({ ok: true, cards: [card(1), card(2)] });
    api.swipeLeft.mockResolvedValue({ ok: true });
    useDeckStore.getState().start('viewer');
    await flush();

    await useDeckStore.getState().decide(card(1), 'pass');
    expect(swipes.spendOneLocally).not.toHaveBeenCalled();
    expect(swipes.setServerBalance).not.toHaveBeenCalled();
  });

  it('returns the card and asks for the plans page when the server has no like to spend', async () => {
    api.fetchFeed.mockResolvedValue({ ok: true, cards: [card(1), card(2)] });
    api.swipeRight.mockResolvedValue({ ok: false, reason: 'no_swipes', balance: 0 });
    useDeckStore.getState().start('viewer');
    await flush();

    await useDeckStore.getState().decide(card(1), 'like');
    const state = useDeckStore.getState();
    expect(state.cards[0]!.id).toBe(card(1).id);
    expect(state.decided[card(1).id]).toBeUndefined();
    expect(state.outOfLikes).toBe(true);
    expect(state.message).toBeNull();
    expect(swipes.setServerBalance).toHaveBeenCalledWith('viewer', 0);

    state.acknowledgeOutOfLikes();
    expect(useDeckStore.getState().outOfLikes).toBe(false);
  });

  it('re-reads the balance when a like fails or the profile is gone', async () => {
    api.fetchFeed.mockResolvedValue({ ok: true, cards: [card(1), card(2), card(3)] });
    api.swipeRight
      .mockResolvedValueOnce({ ok: false, reason: 'not_available' })
      .mockRejectedValueOnce(new Error('network'));
    useDeckStore.getState().start('viewer');
    await flush();

    await useDeckStore.getState().decide(card(1), 'like');
    await useDeckStore.getState().decide(card(2), 'like');
    expect(swipes.refreshSwipes).toHaveBeenCalledTimes(2);
  });

  it('announces a match the like just made, once', async () => {
    api.fetchFeed.mockResolvedValue({ ok: true, cards: [card(1), card(2)] });
    api.swipeRight
      .mockResolvedValueOnce({
        ok: true,
        liked: true,
        replayed: false,
        balance: 2,
        match: { id: 'match-1' },
      })
      .mockResolvedValueOnce({ ok: true, liked: true, replayed: false, balance: 1, match: null });
    useDeckStore.getState().start('viewer');
    await flush();

    await useDeckStore.getState().decide(card(1), 'like');
    expect(useDeckStore.getState().newMatch).toBe('match-1');
    expect(matching.refreshMatches).toHaveBeenCalledWith('viewer');

    useDeckStore.getState().acknowledgeMatch();
    await useDeckStore.getState().decide(card(2), 'like');
    expect(useDeckStore.getState().newMatch).toBeNull();
    expect(matching.refreshMatches).toHaveBeenCalledTimes(1);
  });

  it('ignores a page that arrives after the deck was refreshed', async () => {
    let resolveOld: (value: unknown) => void = () => {};
    api.fetchFeed
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce({ ok: true, cards: [card(9)] });
    useDeckStore.getState().start('viewer');
    const refreshed = useDeckStore.getState().refresh();
    await refreshed;
    resolveOld({ ok: true, cards: [card(1), card(2)] });
    await flush();
    expect(useDeckStore.getState().cards.map((c) => c.id)).toEqual([card(9).id]);
    expect(useDeckStore.getState().status).toBe('ready');
  });

  it('shows the not-eligible state from the server', async () => {
    api.fetchFeed.mockResolvedValueOnce({ ok: false, reason: 'not_eligible' });
    useDeckStore.getState().start('viewer');
    await flush();
    expect(useDeckStore.getState().status).toBe('not_eligible');
  });

  it('shows an error when the first page fails', async () => {
    api.fetchFeed.mockRejectedValueOnce(new Error('offline'));
    useDeckStore.getState().start('viewer');
    await flush();
    expect(useDeckStore.getState().status).toBe('error');
  });
});
