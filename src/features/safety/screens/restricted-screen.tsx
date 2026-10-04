import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulIcon } from '@/components/soul-icon';
import { SoulInput } from '@/components/soul-input';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { submitAppeal, useMyAppeal } from '@/features/admin/api/admin';
import { MAX_APPEAL, appealCopy } from '@/features/admin/model/admin';
import { useCurrentUserId, useServerStatusData } from '@/features/auth/account-status-provider';
import { signOut } from '@/features/auth/api/auth';
import { restrictionCopy } from '@/features/safety/model/safety';
import { shortDate } from '@/features/swipes/model/swipes';
import { createThemedStyles, spacing } from '@/theme';

/**
 * Suspended, banned or being deleted (spec 67). The account is hidden from everyone; this
 * screen says so plainly, with no internal details. A suspended or banned person can ask
 * for a review once at a time (spec 45, D-055), and can always sign out.
 */
export function RestrictedScreen() {
  const styles = useStyles();
  const status = useServerStatusData();
  const userId = useCurrentUserId();
  const state = status?.account_state;
  const canAppeal = state === 'suspended' || state === 'banned';
  const copy = restrictionCopy(
    state === 'banned' || state === 'deletion_pending' ? state : 'suspended',
    status?.restricted_until ?? null,
    shortDate,
  );
  return (
    <SoulScreen scroll>
      <View style={styles.body}>
        <SoulIcon name="lock" size="lg" color="textPrimary" />
        {/* Stretched: a shrink-wrapped centred title lost its last word on Android. */}
        <SoulText variant="title" align="center" accessibilityRole="header" style={styles.stretch}>
          {copy.title}
        </SoulText>
        <SoulText variant="body" tone="secondary" align="center" style={styles.stretch}>
          {copy.body}
        </SoulText>
      </View>
      {canAppeal && userId ? <Appeal userId={userId} /> : null}
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

function Appeal({ userId }: { userId: string }) {
  const styles = useStyles();
  const appeal = useMyAppeal(userId);
  const [writing, setWriting] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = appeal.data?.status === 'open';
  const note = appealCopy(appeal.data ?? null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await submitAppeal(userId, message);
      if (outcome.ok) {
        setWriting(false);
        setMessage('');
      } else {
        setError(
          outcome.reason === 'too_many'
            ? 'You have asked several times this month. Try again later.'
            : "Couldn't send that. Try again.",
        );
      }
    } catch {
      setError("Couldn't send that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.appeal}>
      {note ? (
        <SoulText variant="supporting" tone="secondary" align="center">
          {note}
        </SoulText>
      ) : null}
      {pending ? null : writing ? (
        <>
          <SoulInput
            label="What should SOUL know?"
            value={message}
            onChangeText={(text) => setMessage(text.slice(0, MAX_APPEAL))}
            multiline
            maxLength={MAX_APPEAL}
            showCount
          />
          <SoulButton
            label="Send"
            block
            loading={busy}
            disabled={message.trim().length === 0}
            onPress={() => void send()}
          />
        </>
      ) : (
        <SoulButton
          label="Ask for a review"
          variant="ghost"
          block
          onPress={() => setWriting(true)}
        />
      )}
      {error ? (
        <SoulText variant="supporting" tone="secondary" align="center" accessibilityRole="alert">
          {error}
        </SoulText>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles(() =>
  StyleSheet.create({
    stretch: { alignSelf: 'stretch' },
    body: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      paddingVertical: spacing.xl,
    },
    appeal: { gap: spacing.md, marginBottom: spacing.md },
  }),
);
