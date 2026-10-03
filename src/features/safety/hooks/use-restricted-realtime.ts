import { useEffect } from 'react';

import { appealKey } from '@/features/admin/api/admin';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { joinAccount } from '@/features/chat/api/realtime';
import { queryClient } from '@/lib/query-client';

/**
 * The restricted screen listens on the account's own topic too, so a restored account or an
 * answered appeal shows at once (D-055) instead of after the next app start.
 */
export function useRestrictedRealtime() {
  const userId = useCurrentUserId();
  useEffect(() => {
    if (!userId) return;
    return joinAccount(userId, (reason) => {
      if (reason === 'account' || reason === null) {
        void queryClient.invalidateQueries({ queryKey: ['account-status'] });
        void queryClient.invalidateQueries({ queryKey: appealKey(userId) });
      }
    });
  }, [userId]);
}
