import { useEffect } from 'react';

import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { joinAccount } from '@/features/chat/api/realtime';
import { refreshDates } from '@/features/dates/api/dates';
import { refreshInstant } from '@/features/instant/api/instant';
import { refreshMatches } from '@/features/matching/api/matches';
import { refreshPayments } from '@/features/swipes/api/payments';
import { refreshSwipes } from '@/features/swipes/api/swipes';

/**
 * Listens on the account's private topic while the app is open: the server nudges it when a
 * match is made or ended, a message arrives, an Instant Meet session starts or ends, a date is
 * confirmed, or a payment is confirmed or refunded, and the affected lists re-read.
 */
export function useAccountRealtime() {
  const userId = useCurrentUserId();
  useEffect(() => {
    if (!userId) return;
    return joinAccount(userId, (reason) => {
      if (reason !== 'instant' && reason !== 'date' && reason !== 'payment') {
        void refreshMatches(userId);
      }
      // A payment confirmed or refunded: likes, plan and the purchase history re-read.
      if (reason === 'payment' || reason === null) {
        void refreshSwipes(userId);
        void refreshPayments();
      }
      if (reason === 'instant' || reason === null) void refreshInstant(userId);
      // A date confirmed or closed: the prompt, the sheet and the owner's progress re-read.
      if (reason === 'date' || reason === null) void refreshDates();
    });
  }, [userId]);
}
