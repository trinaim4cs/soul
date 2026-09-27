import { create } from 'zustand';

/**
 * In-memory sign-in progress only (never persisted): the rules version the user ticked
 * before sign-in, and the email awaiting its code. Kept out of route params on purpose.
 */
type SignInState = {
  acceptedRulesVersion: string | null;
  pendingEmail: string | null;
  setAcceptedRules: (version: string) => void;
  setPendingEmail: (email: string) => void;
  reset: () => void;
};

export const useSignInStore = create<SignInState>((set) => ({
  acceptedRulesVersion: null,
  pendingEmail: null,
  setAcceptedRules: (version) => set({ acceptedRulesVersion: version }),
  setPendingEmail: (email) => set({ pendingEmail: email }),
  reset: () => set({ acceptedRulesVersion: null, pendingEmail: null }),
}));
