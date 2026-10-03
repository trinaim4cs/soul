import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { notificationRoute } from '@/features/notifications/model/notifications';
import { notifications } from '@/services/notifications';

/**
 * Signed-in app shell (D-054): binds this device to whoever is signed in (a token moves to
 * the latest person on that phone) and opens the page a tapped notification points to.
 */
export function usePush() {
  const userId = useCurrentUserId();

  useEffect(() => {
    if (!userId) return;
    void notifications.getPermission().then((permission) => {
      if (permission === 'granted') void notifications.register();
    });
  }, [userId]);

  useEffect(
    () =>
      notifications.onOpen((url) => {
        const route = notificationRoute(url);
        if (route) router.push(route as Href);
      }),
    [],
  );
}
