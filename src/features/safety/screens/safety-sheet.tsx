import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { unmatch } from '@/features/matching/api/matches';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { blockUser, refreshAfterBlock } from '@/features/safety/api/safety';
import type { SafetyContext } from '@/features/safety/model/safety';
import { SettingsRow } from '@/features/settings/components/settings-row';
import { createThemedStyles, spacing } from '@/theme';

type Props = { personId: string; name: string; context: SafetyContext; matchId: string | null };

/** Leaves the screen about this person entirely: they are gone from every list now. */
function leave(context: SafetyContext) {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(context === 'instant' ? '/instant' : context === 'discovery' ? '/' : '/chats');
}

/**
 * Safety actions for one person (spec 42; MOBILE-DESIGN: reachable from every profile and
 * chat surface, from one sheet). Blocking ends everything between the two, and they are never
 * told: on their side it looks like an ordinary unmatch.
 */
export function SafetySheet({ personId, name, context, matchId }: Props) {
  const styles = useStyles();
  const userId = useCurrentUserId();
  const [confirm, setConfirm] = useState<'block' | 'unmatch' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: 'block' | 'unmatch') {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'block') await blockUser(personId);
      else if (matchId) await unmatch(userId, matchId);
      await refreshAfterBlock();
      leave(context);
    } catch {
      setError("That didn't go through. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (confirm) {
    const blocking = confirm === 'block';
    return (
      <SoulScreen
        edges={{ top: false, bottom: true }}
        footer={
          <View style={styles.footer}>
            {error ? (
              <SoulText variant="supporting" align="center" role="alert">
                {error}
              </SoulText>
            ) : null}
            <SoulButton
              label={blocking ? `Block ${name}` : `Unmatch ${name}`}
              onPress={() => void run(confirm)}
              loading={busy}
              block
            />
            <SoulButton
              label="Cancel"
              variant="ghost"
              onPress={() => setConfirm(null)}
              disabled={busy}
              block
            />
          </View>
        }>
        <View style={styles.body}>
          <SoulText variant="section" italic accessibilityRole="header" style={styles.stretch}>
            {blocking ? `Block ${name}?` : `Unmatch ${name}?`}
          </SoulText>
          <SoulText tone="secondary" style={styles.stretch}>
            {blocking
              ? `You won't see each other anywhere on SOUL, your chat ends, and so does any Instant Meet. ${name} isn't told.`
              : `Your chat ends and you won't see each other again. ${name} isn't told why.`}
          </SoulText>
        </View>
      </SoulScreen>
    );
  }

  return (
    <SoulScreen edges={{ top: false, bottom: true }}>
      <SoulText variant="section" accessibilityRole="header" style={styles.title}>
        {name}
      </SoulText>
      <View style={styles.list}>
        <SettingsRow
          icon="flag"
          label={`Report ${name}`}
          detail="Tell SOUL what happened. They aren't told who reported them."
          onPress={() =>
            router.replace({ pathname: '/report/[id]', params: { id: personId, name, context } })
          }
        />
        <SettingsRow
          icon="block"
          label={`Block ${name}`}
          detail="You won't see each other again."
          onPress={() => setConfirm('block')}
        />
        {matchId ? (
          <SettingsRow
            icon="close"
            label="Unmatch"
            detail="End the match and the chat."
            onPress={() => setConfirm('unmatch')}
          />
        ) : null}
      </View>
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(() =>
  StyleSheet.create({
    title: { marginTop: spacing.md },
    list: { marginTop: spacing.md },
    body: { gap: spacing.md, paddingTop: spacing.lg },
    // Full width: shrink-wrapped serif text can lose its last word on Android.
    stretch: { alignSelf: 'stretch' },
    footer: { gap: spacing.xs },
  }),
);
