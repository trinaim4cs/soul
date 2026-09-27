import { SoulScreen } from '@/components/soul-screen';
import { EmptyState } from '@/components/states';
import { signOut } from '@/features/auth/api/auth';

/** Shown after an under-18 date of birth. SOUL is strictly 18+ (spec v2 section 12). */
export function AgeLockedScreen() {
  return (
    <SoulScreen>
      <EmptyState
        icon="lock"
        title="SOUL is for people 18 and older"
        body="You can't use SOUL right now. We haven't saved your date of birth."
        action={{ label: 'Sign out', onPress: () => void signOut() }}
      />
    </SoulScreen>
  );
}
