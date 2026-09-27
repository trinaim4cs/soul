import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { useServerStatus, type ServerStatus } from '@/features/auth/api/account-status';
import {
  deriveAccountStatus,
  type AccountStatus,
  type ServerStatusSnapshot,
} from '@/features/auth/model/account-status';
import { supabase } from '@/lib/supabase';

type SessionState = { loaded: boolean; session: Session | null };

type AccountStatusValue = {
  status: AccountStatus;
  server: ServerStatus | undefined;
  userId: string | null;
  retry: () => void;
};

const AccountStatusContext = createContext<AccountStatusValue>({
  status: 'loading',
  server: undefined,
  userId: null,
  retry: () => {},
});

export function AccountStatusProvider({ children }: { children: ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionState>({ loaded: false, session: null });

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSessionState({ loaded: true, session: data.session });
      })
      .catch(() => {
        // An unreadable stored session is treated as signed out; the user signs in again.
        if (active) setSessionState({ loaded: true, session: null });
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionState({ loaded: true, session });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const userId = sessionState.session?.user.id ?? null;
  const serverStatus = useServerStatus(userId);
  const server: ServerStatusSnapshot = serverStatus.data
    ? {
        kind: 'ready',
        accountState: serverStatus.data.account_state,
        eligibility: serverStatus.data.eligibility,
      }
    : serverStatus.isError
      ? { kind: 'error' }
      : { kind: 'pending' };

  const derived = deriveAccountStatus({
    sessionLoaded: sessionState.loaded,
    hasSession: userId !== null,
    server,
  });

  // After the first settled status, keep showing the current route group while a new
  // status loads (for example right after the OTP succeeds) instead of blanking the app.
  // (React's "adjusting state while rendering" pattern.)
  const [lastSettled, setLastSettled] = useState<AccountStatus | null>(null);
  if (derived !== 'loading' && derived !== lastSettled) setLastSettled(derived);
  const status = derived === 'loading' && lastSettled ? lastSettled : derived;

  return (
    <AccountStatusContext
      value={{
        status,
        server: serverStatus.data,
        userId,
        retry: () => void serverStatus.refetch(),
      }}>
      {children}
    </AccountStatusContext>
  );
}

export function useAccountStatus(): AccountStatus {
  return use(AccountStatusContext).status;
}

export function useRetryAccountStatus(): () => void {
  return use(AccountStatusContext).retry;
}

/** Server step flags for onboarding routing (undefined until loaded). */
export function useServerStatusData(): ServerStatus | undefined {
  return use(AccountStatusContext).server;
}

export function useCurrentUserId(): string | null {
  return use(AccountStatusContext).userId;
}
