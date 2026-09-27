import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { signOut } from '@/features/auth/api/auth';
import { SettingsRow } from '@/features/settings/components/settings-row';
import { spacing } from '@/theme';

/**
 * Settings (spec 43). Rows appear as their phases land: discovery preferences (6), plans and
 * swipes (7, 12), blocked users (13), notifications (14), delete account (13).
 */
export function SettingsScreen() {
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
          icon="visibility_off"
          label="Privacy"
          detail="Visibility, anonymous mode, zodiac"
          onPress={() => router.push('/settings/privacy')}
        />
        <SettingsRow
          icon="shield"
          label="Rules and policies"
          onPress={() => router.push('/legal/community')}
        />
      </View>
      <SoulButton
        label="Sign out"
        icon="logout"
        variant="secondary"
        block
        onPress={() => void signOut()}
      />
    </SoulScreen>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.lg, marginBottom: spacing.xl },
});
