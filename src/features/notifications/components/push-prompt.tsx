import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { turnOnPush, useDevicePush } from '@/features/notifications/api/notifications';
import { queryClient } from '@/lib/query-client';
import { secureStorage } from '@/services/secure-storage';
import { borders, createThemedStyles, radii, spacing } from '@/theme';

const DISMISSED = 'soul.push-prompt.dismissed';
const dismissedKey = ['notifications', 'prompt-dismissed'] as const;

/**
 * The one push ask (spec 44, D-054): on Chats, once there is a first match, while the device
 * has never been asked. "Not now" hides it for good; Settings → Notifications stays available.
 */
export function PushPrompt({ userId }: { userId: string | null }) {
  const styles = useStyles();
  const device = useDevicePush();
  const dismissed = useQuery({
    queryKey: dismissedKey,
    queryFn: async () => (await secureStorage.getItem(DISMISSED)) === '1',
  });
  const [busy, setBusy] = useState(false);

  if (device.data?.permission !== 'undetermined' || dismissed.data !== false) return null;

  async function hide() {
    await secureStorage.setItem(DISMISSED, '1');
    queryClient.setQueryData(dismissedKey, true);
  }

  async function turnOn() {
    setBusy(true);
    try {
      await turnOnPush(userId);
    } finally {
      setBusy(false);
      await hide();
    }
  }

  return (
    <View style={styles.card} accessibilityRole="summary">
      <SoulIcon name="notifications" size="md" color="textPrimary" />
      <View style={styles.text}>
        <SoulText variant="bodyStrong">Know when they reply</SoulText>
        <SoulText variant="supporting" tone="secondary">
          Get a notification for new matches and messages. It never shows what was said.
        </SoulText>
        <View style={styles.actions}>
          <SoulButton label="Turn on" size="sm" loading={busy} onPress={() => void turnOn()} />
          <SoulButton label="Not now" size="sm" variant="ghost" onPress={() => void hide()} />
        </View>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderRadius: radii.lg,
      borderWidth: borders.hairline,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    text: { flex: 1, gap: spacing.xs },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  }),
);
