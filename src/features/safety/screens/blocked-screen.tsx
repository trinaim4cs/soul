import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { refreshAfterBlock, unblockUser, useMyBlocks } from '@/features/safety/api/safety';
import { shortDate } from '@/features/swipes/model/swipes';
import { createThemedStyles, radii, spacing } from '@/theme';

/**
 * Settings → Blocked (spec 43). Unblocking lets the two find each other again in Discover;
 * it never brings back an old match or chat.
 */
export function BlockedScreen() {
  const styles = useStyles();
  const userId = useCurrentUserId();
  const blocks = useMyBlocks(userId);
  const [busy, setBusy] = useState<string | null>(null);

  async function unblock(id: string) {
    setBusy(id);
    try {
      await unblockUser(id);
      await refreshAfterBlock();
    } finally {
      setBusy(null);
    }
  }

  if (blocks.isPending) return <LoadingState />;
  if (blocks.isError) {
    return (
      <ErrorState
        title="Couldn't load blocked people"
        body="Check your connection and try again."
        onRetry={() => void blocks.refetch()}
      />
    );
  }

  return (
    <SoulScreen scroll edges={{ top: false, bottom: true }}>
      <SoulText variant="title" accessibilityRole="header">
        Blocked
      </SoulText>
      <SoulText tone="secondary" style={styles.intro}>
        People you block can&apos;t see you or message you, and they aren&apos;t told. Unblocking
        doesn&apos;t bring back a match or a chat.
      </SoulText>
      {blocks.data.length === 0 ? (
        <EmptyState icon="block" title="Nobody blocked" body="People you block show up here." />
      ) : (
        <View style={styles.list}>
          {blocks.data.map((person) => (
            <View key={person.id} style={styles.row}>
              <View style={styles.rowText}>
                <SoulText variant="label">{person.name ?? 'Anonymous'}</SoulText>
                <SoulText variant="supporting" tone="tertiary">
                  {`Blocked ${shortDate(person.blocked_at)}`}
                </SoulText>
              </View>
              <SoulButton
                label="Unblock"
                variant="secondary"
                size="sm"
                loading={busy === person.id}
                disabled={busy !== null}
                onPress={() => void unblock(person.id)}
              />
            </View>
          ))}
        </View>
      )}
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    intro: { marginTop: spacing.sm },
    list: { marginTop: spacing.lg, gap: spacing.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceSubtle,
    },
    rowText: { flex: 1, gap: spacing.xxs },
  }),
);
