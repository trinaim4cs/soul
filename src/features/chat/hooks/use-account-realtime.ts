import { useEffect } from 'react';

import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { joinAccount } from '@/features/chat/api/realtime';
import { refreshMatches } from '@/features/matching/api/matches';

/**
 * Listens on the account's private topic while the app is open: the server nudges it when a
 * match is made or ended, or a message arrives, and the chat list and tab count re-read.
 */
export function useAccountRealtime() {
  const userId = useCurrentUserId();
  useEffect(() => {
    if (!userId) return;
    return joinAccount(userId, () => void refreshMatches(userId));
  }, [userId]);
}
