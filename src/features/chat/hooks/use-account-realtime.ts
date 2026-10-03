import { useEffect } from 'react';

import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { joinAccount } from '@/features/chat/api/realtime';
import { refreshDates } from '@/features/dates/api/dates';
import { refreshInstant } from '@/features/instant/api/instant';
import { refreshMatches } from '@/features/matching/api/matches';

/**
 * Listens on the account's private topic while the app is open: the server nudges it when a
 * match is made or ended, a message arrives, an Instant Meet session starts or ends, or a date
 * is confirmed, and the affected lists re-read.
 */
export function useAccountRealtime() {
  const userId = useCurrentUserId();
  useEffect(() => {
    if (!userId) return;
    return joinAccount(userId, (reason) => {
      if (reason !== 'instant' && reason !== 'date') void refreshMatches(userId);
      if (reason === 'instant' || reason === null) void refreshInstant(userId);
      // A date confirmed or closed: the prompt, the sheet and the owner's progress re-read.
      if (reason === 'date' || reason === null) void refreshDates();
    });
  }, [userId]);
}
