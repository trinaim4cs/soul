import { useQuery } from '@tanstack/react-query';
import { Linking, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/states';
import { SoulButton } from '@/components/soul-button';
import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { installedVersionCode } from '@/features/distribution/api/app-release';
import type { AndroidRelease } from '@/features/distribution/model/app-release';
import { queryClient } from '@/lib/query-client';
import { secureStorage } from '@/services/secure-storage';
import { borders, createThemedStyles, radii, spacing } from '@/theme';

const DISMISSED = 'soul.update-prompt.dismissed';
const dismissedKey = ['distribution', 'update-dismissed'] as const;

function openDownload(release: AndroidRelease) {
  if (release.apk_url) void Linking.openURL(release.apk_url).catch(() => {});
}

/**
 * This build is older than the oldest one the server still supports (D-039): nothing else
 * can be used until it is updated. Accounts, matches and chats live on the server, so an
 * update keeps everything.
 */
export function UpdateRequired({ release }: { release: AndroidRelease }) {
  const styles = useStyles();
  return (
    <View style={styles.full}>
      <EmptyState
        icon="download"
        title="Update SOUL"
        body="This version of SOUL is no longer supported. Download the new one to carry on: your account, matches and chats stay as they are."
        action={{ label: 'Download the update', onPress: () => openDownload(release) }}
      />
    </View>
  );
}

/** A newer APK is out (D-039): offered once per version, at the top of Chats. */
export function UpdateCard({ release }: { release: AndroidRelease }) {
  const styles = useStyles();
  const dismissed = useQuery({
    queryKey: dismissedKey,
    queryFn: async () => Number((await secureStorage.getItem(DISMISSED)) ?? 0),
  });
  if (dismissed.data === undefined || dismissed.data >= release.latest_version_code) return null;
  if (installedVersionCode === null) return null;

  async function hide() {
    await secureStorage.setItem(DISMISSED, String(release.latest_version_code));
    queryClient.setQueryData(dismissedKey, release.latest_version_code);
  }

  return (
    <View style={styles.card} accessibilityRole="summary">
      <SoulIcon name="download" size="md" color="textPrimary" />
      <View style={styles.text}>
        <SoulText variant="bodyStrong">
          {release.latest_version
            ? `SOUL ${release.latest_version} is ready`
            : 'An update is ready'}
        </SoulText>
        <SoulText variant="supporting" tone="secondary">
          Download it from the SOUL site. Everything in your account stays.
        </SoulText>
        <View style={styles.actions}>
          <SoulButton label="Update" size="sm" onPress={() => openDownload(release)} />
          <SoulButton label="Later" size="sm" variant="ghost" onPress={() => void hide()} />
        </View>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    full: { flex: 1, backgroundColor: colors.background, justifyContent: 'center' },
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
