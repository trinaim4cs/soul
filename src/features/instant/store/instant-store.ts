import { create } from 'zustand';

export type LocationProblem = 'denied' | 'unavailable';

type InstantStore = {
  /** Why the device position is not reaching the server, if it is not. */
  locationProblem: LocationProblem | null;
  /** The session that just ended (shown once on the Instant tab). */
  ended: { name: string } | null;
  setLocationProblem: (problem: LocationProblem | null) => void;
  noteEnded: (name: string) => void;
  clearEnded: () => void;
};

/** Device-side Instant Meet state. Everything else comes from the server (`instant_state`). */
export const useInstantStore = create<InstantStore>((set) => ({
  locationProblem: null,
  ended: null,
  setLocationProblem: (locationProblem) => set({ locationProblem }),
  noteEnded: (name) => set({ ended: { name } }),
  clearEnded: () => set({ ended: null }),
}));
