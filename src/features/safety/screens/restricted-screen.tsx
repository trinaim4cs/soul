import { SoulScreen } from '@/components/soul-screen';
import { EmptyState } from '@/components/states';
import { signOut } from '@/features/auth/api/auth';
import { useServerStatusData } from '@/features/auth/account-status-provider';
import { restrictionCopy } from '@/features/safety/model/safety';
import { shortDate } from '@/features/swipes/model/swipes';

/**
 * Suspended, banned or being deleted (spec 67). The account is hidden from everyone; this
 * screen says so plainly, with no internal details, and offers only signing out.
 */
export function RestrictedScreen() {
  const status = useServerStatusData();
  const state = status?.account_state;
  const copy = restrictionCopy(
    state === 'banned' || state === 'deletion_pending' ? state : 'suspended',
    status?.restricted_until ?? null,
    shortDate,
  );
  return (
    <SoulScreen>
      <EmptyState
        icon="lock"
        title={copy.title}
        body={copy.body}
        action={{ label: 'Sign out', onPress: () => void signOut() }}
      />
    </SoulScreen>
  );
}
