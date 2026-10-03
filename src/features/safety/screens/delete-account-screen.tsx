import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulInput } from '@/components/soul-input';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { deleteAccount } from '@/features/safety/api/safety';
import { createThemedStyles, spacing } from '@/theme';

const CONFIRM_WORD = 'DELETE';

/**
 * Settings → Delete account (spec 43, 67; D-053). Deletion happens on the server, at once, and
 * cannot be undone. The screen says exactly what goes and what is kept before anything happens.
 */
export function DeleteAccountScreen() {
  const styles = useStyles();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim().toUpperCase() === CONFIRM_WORD;

  async function confirm() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      // Signed out: the root layout now shows the welcome screen.
    } catch {
      setError("Your account couldn't be deleted. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <SoulScreen
      keyboard
      edges={{ top: false, bottom: true }}
      footer={
        <View style={styles.footer}>
          {error ? (
            <SoulText variant="supporting" align="center" role="alert">
              {error}
            </SoulText>
          ) : null}
          <SoulButton
            label="Delete my account"
            onPress={() => void confirm()}
            disabled={!ready}
            loading={busy}
            block
          />
          <SoulButton label="Keep my account" variant="ghost" onPress={() => router.back()} block />
        </View>
      }>
      <SoulText variant="title" accessibilityRole="header">
        Delete account
      </SoulText>
      <View style={styles.points}>
        <SoulText tone="secondary">
          Your profile, photos, likes, matches, chats and dates are deleted now, and you are signed
          out everywhere. This can&apos;t be undone.
        </SoulText>
        <SoulText tone="secondary">
          Any likes and plan time you have left end with it. They are not refunded.
        </SoulText>
        <SoulText tone="secondary">
          SOUL keeps purchase records for tax law, and safety records (reports and bans, linked to a
          one-way fingerprint of your email, not the email) for up to 12 months.
        </SoulText>
        <SoulText
          variant="supporting"
          accessibilityRole="link"
          style={styles.link}
          onPress={() => router.push('/legal/retention')}>
          Deletion and data retention policy
        </SoulText>
      </View>
      <SoulInput
        label={`Type ${CONFIRM_WORD} to confirm`}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
      />
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(() =>
  StyleSheet.create({
    points: { gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.lg },
    link: { alignSelf: 'flex-start', paddingVertical: spacing.xs, textDecorationLine: 'underline' },
    footer: { gap: spacing.xs },
  }),
);
