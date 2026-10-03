import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulIcon } from '@/components/soul-icon';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { ErrorState, LoadingState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { DateProgress } from '@/features/dates/components/date-progress';
import { useMyProfile } from '@/features/profile/api/profile';
import { ProfileView } from '@/features/profile/components/profile-view';
import { useOwnProfileView } from '@/features/profile/hooks/use-own-profile-view';
import type { IconName } from '@/theme';
import { createThemedStyles, radii, sizes, spacing } from '@/theme';

const MODE_NOTE = {
  private: 'Private mode is on: you are hidden from Discover. Matches and chats still work.',
  anonymous: 'Anonymous mode is on: people see blurred photos and no name.',
} as const;

/** The You tab: your profile exactly as other students see it, plus edit and settings. */
export function MyProfileScreen() {
  const styles = useStyles();
  const userId = useCurrentUserId();
  const profile = useMyProfile(userId);
  const view = useOwnProfileView(profile.data);

  if (profile.isPending) return <LoadingState />;
  if (profile.isError || !profile.data || !view) {
    return (
      <ErrorState
        title="Couldn't load your profile"
        body="Check your connection and try again."
        onRetry={() => void profile.refetch()}
      />
    );
  }
  const mode = profile.data.privacy_mode;
  const pending = profile.data.photos.some((photo) => photo.status === 'pending');

  return (
    <SoulScreen scroll edges={{ top: true, bottom: false }}>
      <View style={styles.header}>
        <SoulText variant="title" accessibilityRole="header" style={styles.title}>
          You
        </SoulText>
        <HeaderButton
          icon="edit"
          label="Edit profile"
          onPress={() => router.push('/profile/edit')}
        />
        <HeaderButton icon="settings" label="Settings" onPress={() => router.push('/settings')} />
      </View>
      {mode !== 'normal' ? (
        <View style={styles.note}>
          <SoulIcon name="visibility_off" size="sm" color="textSecondary" weight="regular" />
          <SoulText variant="supporting" tone="secondary" style={styles.noteText}>
            {MODE_NOTE[mode]}
          </SoulText>
        </View>
      ) : null}
      {pending ? (
        <View style={styles.note}>
          <SoulIcon name="hourglass_empty" size="sm" color="textSecondary" weight="regular" />
          <SoulText variant="supporting" tone="secondary" style={styles.noteText}>
            Some photos are in review. Others see them once they are approved.
          </SoulText>
        </View>
      ) : null}
      {userId ? <DateProgress userId={userId} /> : null}
      <ProfileView profile={view} />
    </SoulScreen>
  );
}

function HeaderButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.iconButton}>
      <SoulIcon name={icon} size="md" />
    </PressableScale>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    title: { flex: 1 },
    iconButton: {
      width: sizes.touchTarget,
      height: sizes.touchTarget,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSubtle,
    },
    note: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      padding: spacing.sm,
      marginBottom: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceSubtle,
    },
    noteText: { flex: 1 },
  }),
);
