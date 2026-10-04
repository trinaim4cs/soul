import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { useAdminRole } from '@/features/admin/api/admin';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { signOut } from '@/features/auth/api/auth';
import { useUpdateNeed } from '@/features/distribution/api/app-release';
import { SettingsRow } from '@/features/settings/components/settings-row';
import { useSwipeBalance } from '@/features/swipes/api/swipes';
import { balanceSummary } from '@/features/swipes/model/swipes';
import { spacing } from '@/theme';

/**
 * Settings (spec 43). Rows appear as their phases land: discovery preferences (6), plans and
 * swipes (7, 12), blocked users (13), notifications (14), delete account (13).
 */
export function SettingsScreen() {
  const userId = useCurrentUserId();
  const swipes = useSwipeBalance(userId);
  // Shown only to people the server lists as moderators or admins (D-055).
  const role = useAdminRole(userId);
  const update = useUpdateNeed(userId !== null);
  return (
    <SoulScreen scroll edges={{ top: false, bottom: true }}>
      <SoulText variant="title" accessibilityRole="header">
        Settings
      </SoulText>
      <View style={styles.list}>
        <SettingsRow
          icon="edit"
          label="Edit profile"
          onPress={() => router.push('/profile/edit')}
        />
        <SettingsRow
          icon="tune"
          label="Discovery preferences"
          detail="Age, who you see, zodiac"
          onPress={() => router.push('/filters')}
        />
        <SettingsRow
          icon="favorite"
          label="Plans and likes"
          detail={swipes.data ? balanceSummary(swipes.data) : undefined}
          onPress={() => router.push('/paywall')}
        />
        <SettingsRow
          icon="download"
          label="Purchases"
          detail="History and missed payments"
          onPress={() => router.push('/settings/purchases')}
        />
        <SettingsRow
          icon="block"
          label="Blocked"
          detail="People you have blocked"
          onPress={() => router.push('/settings/blocked')}
        />
        <SettingsRow
          icon="notifications"
          label="Notifications"
          detail="Matches, messages, Instant Meet, payments"
          onPress={() => router.push('/settings/notifications')}
        />
        <SettingsRow
          icon="visibility_off"
          label="Privacy"
          detail="Visibility, read receipts, zodiac"
          onPress={() => router.push('/settings/privacy')}
        />
        <SettingsRow
          icon="shield"
          label="Rules and policies"
          onPress={() => router.push('/legal/community')}
        />
        <SettingsRow
          icon="lock"
          label="Data and privacy"
          detail="What SOUL keeps, and for how long"
          onPress={() => router.push('/legal/retention')}
        />
        {update.need === 'optional' && update.release?.apk_url ? (
          <SettingsRow
            icon="download"
            label="Update SOUL"
            detail={update.release.latest_version ?? undefined}
            onPress={() => {
              const url = update.release?.apk_url;
              if (url) void Linking.openURL(url).catch(() => {});
            }}
          />
        ) : null}
        {role.data ? (
          <SettingsRow
            icon="flag"
            label="Admin"
            detail="Reports, photos, appeals and more"
            onPress={() => router.push('/admin')}
          />
        ) : null}
        <SettingsRow
          icon="remove"
          label="Delete account"
          detail="Permanently, with everything in it"
          onPress={() => router.push('/settings/delete')}
        />
      </View>
      <SoulButton
        label="Sign out"
        icon="logout"
        variant="secondary"
        block
        onPress={() => void signOut()}
      />
      <SoulText variant="caption" tone="tertiary" align="center" style={styles.version} numeric>
        {`SOUL ${Constants.expoConfig?.version ?? ''}`}
      </SoulText>
    </SoulScreen>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.lg, marginBottom: spacing.xl },
  version: { marginTop: spacing.lg },
});
