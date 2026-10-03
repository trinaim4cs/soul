import * as Haptics from 'expo-haptics';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { refreshInstant, sendFix, useInstantState } from '@/features/instant/api/instant';
import { shouldSendFix } from '@/features/instant/model/instant';
import { useInstantStore } from '@/features/instant/store/instant-store';
import { personName } from '@/features/matching/model/match';
import { location } from '@/services/location';

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return active;
}

/**
 * Runs for the whole signed-in app (DECISIONS D-050). While the server says Instant is on and
 * the app is in the foreground, the device sends its own position, and only then. When a
 * session starts it opens the session screen; when one ends it leaves a note for the tab.
 */
export function useInstantPresence() {
  const userId = useCurrentUserId();
  const state = useInstantState(userId);
  const appActive = useAppActive();
  const setLocationProblem = useInstantStore((store) => store.setLocationProblem);
  const noteEnded = useInstantStore((store) => store.noteEnded);
  const instantOn = state.data?.active === true;
  const pathname = usePathname();
  const where = useRef(pathname);
  useEffect(() => {
    where.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!userId || !instantOn || !appActive) return;
    let lastSent: number | null = null;
    let reported = false;
    const stop = location.watch(
      (fix) => {
        const now = Date.now();
        if (!shouldSendFix(fix, lastSent, now)) return;
        lastSent = now;
        sendFix(fix)
          .then(() => {
            setLocationProblem(null);
            // The first position makes candidates possible: look straight away.
            if (!reported) void refreshInstant(userId);
            reported = true;
          })
          .catch(() => {
            // Offline for a moment: the next fix tries again.
          });
      },
      (reason) => setLocationProblem(reason),
    );
    return stop;
  }, [userId, instantOn, appActive, setLocationProblem]);

  // Session transitions: open the compass when one starts, remember who when one ends.
  const session = state.data?.session ?? null;
  const previous = useRef(session);
  useEffect(() => {
    const before = previous.current;
    previous.current = session;
    if (session && session.id !== before?.id) {
      // Already on this meet (a reload or a deep link): nothing to open.
      const open =
        where.current === `/instant/session/${session.id}` ||
        where.current === `/instant/chat/${session.conversation_id}`;
      if (open) return;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.push({ pathname: '/instant/session/[id]', params: { id: session.id } });
    } else if (!session && before) {
      noteEnded(before.person.id, personName(before.person));
    }
  }, [session, noteEnded]);
}
