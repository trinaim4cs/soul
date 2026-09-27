import { create } from 'zustand';

import {
  FEED_PAGE_SIZE,
  fetchFeed,
  swipeLeft,
  swipeRight,
} from '@/features/discovery/api/discovery';
import type { DiscoveryCard, SwipeDirection } from '@/features/discovery/model/card';

export type DeckStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'not_eligible';

/** Start fetching the next page when this many cards are left. */
const LOW_WATER = 4;

type DeckState = {
  userId: string | null;
  cards: DiscoveryCard[];
  status: DeckStatus;
  loadingMore: boolean;
  exhausted: boolean;
  /** Ids swiped this session, kept out of later pages even before the server confirms. */
  decided: Record<string, true>;
  message: string | null;
  /** Bumped on every reset so late responses from an older deck are ignored. */
  generation: number;
  start: (userId: string) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  decide: (card: DiscoveryCard, direction: SwipeDirection) => Promise<void>;
  cardById: (id: string) => DiscoveryCard | undefined;
  clearMessage: () => void;
  reset: () => void;
};

const EMPTY = {
  userId: null,
  cards: [],
  status: 'idle' as DeckStatus,
  loadingMore: false,
  exhausted: false,
  decided: {},
  message: null,
};

export const useDeckStore = create<DeckState>((set, get) => ({
  ...EMPTY,
  generation: 0,

  start(userId) {
    const state = get();
    if (state.userId === userId && state.status !== 'idle') return;
    set({ ...EMPTY, userId, generation: state.generation + 1 });
    void get().refresh();
  },

  async refresh() {
    const generation = get().generation + 1;
    // loadingMore resets too: a page still loading for the previous deck is ignored by generation.
    set({
      cards: [],
      decided: {},
      exhausted: false,
      loadingMore: false,
      status: 'loading',
      message: null,
      generation,
    });
    await get().loadMore();
  },

  async loadMore() {
    const state = get();
    if (state.loadingMore || state.exhausted || !state.userId) return;
    const generation = state.generation;
    set({ loadingMore: true });
    try {
      const exclude = [...state.cards.map((card) => card.id), ...Object.keys(state.decided)];
      const result = await fetchFeed(exclude);
      if (get().generation !== generation) return;
      if (!result.ok) {
        set({ status: result.reason === 'not_eligible' ? 'not_eligible' : 'error' });
        return;
      }
      const known = new Set(get().cards.map((card) => card.id));
      const decided = get().decided;
      const fresh = result.cards.filter((card) => !known.has(card.id) && !decided[card.id]);
      const cards = [...get().cards, ...fresh];
      set({
        cards,
        exhausted: result.cards.length < FEED_PAGE_SIZE,
        status: cards.length > 0 ? 'ready' : 'empty',
      });
    } catch {
      if (get().generation !== generation) return;
      if (get().cards.length === 0) set({ status: 'error' });
      else set({ message: "Couldn't load more profiles. Check your connection." });
    } finally {
      if (get().generation === generation) set({ loadingMore: false });
    }
  },

  async decide(card, direction) {
    const generation = get().generation;
    // Optimistic: the card leaves at once; the next one is already underneath.
    set((state) => {
      const cards = state.cards.filter((item) => item.id !== card.id);
      return {
        cards,
        decided: { ...state.decided, [card.id]: true },
        status: cards.length > 0 ? 'ready' : state.exhausted ? 'empty' : state.status,
        message: null,
      };
    });
    if (get().cards.length <= LOW_WATER) void get().loadMore();

    try {
      // "not_available" means the profile changed (hidden, blocked, paused): it simply leaves.
      await (direction === 'like' ? swipeRight(card.id) : swipeLeft(card.id));
    } catch {
      if (get().generation !== generation) return;
      // Network failure: put the card back on top so nothing is lost silently.
      set((state) => {
        const { [card.id]: _removed, ...decided } = state.decided;
        return {
          cards: [card, ...state.cards.filter((item) => item.id !== card.id)],
          decided,
          status: 'ready',
          message: "Couldn't save that. Check your connection and try again.",
        };
      });
    }
    if (get().generation === generation && get().cards.length === 0 && !get().loadingMore) {
      if (get().exhausted) set({ status: 'empty' });
      else void get().loadMore();
    }
  },

  cardById: (id) => get().cards.find((card) => card.id === id),
  clearMessage: () => set({ message: null }),
  reset: () => set({ ...EMPTY, generation: get().generation + 1 }),
}));
