import { useEffect } from 'react';

import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { joinAccount } from '@/features/chat/api/realtime';
import { refreshInstant } from '@/features/instant/api/instant';
import { refreshMatches } from '@/features/matching/api/matches';

/**
 * Listens on the account's private topic while the app is open: the server nudges it when a
 * match is made or ended, a message arrives, or an Instant Meet session starts or ends, and
 * the affected lists re-read.
 */
export function useAccountRealtime() {
  const userId = useCurrentUserId();
  useEffect(() => {
    if (!userId) return;
    return joinAccount(userId, (reason) => {
      if (reason !== 'instant') void refreshMatches(userId);
      if (reason === 'instant' || reason === null) void refreshInstant(userId);
    });
  }, [userId]);
}
