import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulIcon, type IconName } from '@/components/soul-icon';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { answerDate, refreshDates, useDateState } from '@/features/dates/api/dates';
import { dayLabel, lastNote, type DateState } from '@/features/dates/model/dates';
import { personName } from '@/features/matching/model/match';
import { createThemedStyles, spacing } from '@/theme';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/chats');
}

/**
 * "Did you meet?" (spec 35, D-051). A date counts only when both people say yes, each on
 * their own. The other person's answer is never shown before the caller answers.
 */
export function DateSheet({ otherId }: { otherId: string }) {
  const state = useDateState(otherId);
  if (state.isPending) return <LoadingState />;
  if (state.isError && state.data === undefined) {
    return (
      <SoulScreen edges={{ top: false, bottom: true }}>
        <ErrorState
          title="Couldn't load this"
          body="Check your connection and try again."
          onRetry={() => void state.refetch()}
        />
      </SoulScreen>
    );
  }
  if (!state.data) {
    return (
      <SoulScreen edges={{ top: false, bottom: true }}>
        <EmptyState
          icon="info"
          title="This isn't available"
          body="Dates can be confirmed with a match, or within a week of an Instant Meet."
          action={{ label: 'Close', onPress: close }}
        />
      </SoulScreen>
    );
  }
  return <Answer state={state.data} otherId={otherId} />;
}

function Answer({ state, otherId }: { state: DateState; otherId: string }) {
  const styles = useStyles();
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = personName(state.person);

  async function answer(met: boolean) {
    setBusy(met ? 'yes' : 'no');
    setError(null);
    try {
      const result = await answerDate(otherId, met);
      if (result.ok && result.state === 'confirmed') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      await refreshDates();
      if (result.ok && !met) close();
      if (!result.ok && result.reason === 'not_available') close();
    } catch {
      setError("Couldn't save your answer. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  if (state.state === 'waiting') {
    return (
      <Message
        icon="hourglass_empty"
        title={`Waiting for ${name}`}
        body={`It counts if ${name} says yes too${state.closes_at ? ` by ${dayLabel(state.closes_at)}` : ''}. They never see your answer unless they say yes as well.`}
      />
    );
  }

  if (state.state === 'confirmed') {
    return (
      <Message
        icon="check"
        title="You both said you met"
        body={`It counts as a date for the next 30 days.${state.next_at ? ` Another date with ${name} can count after ${dayLabel(state.next_at)}.` : ''}`}
      />
    );
  }

  const note = lastNote(state);
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
            label="Yes, we met"
            onPress={() => void answer(true)}
            loading={busy === 'yes'}
            disabled={busy !== null}
            block
          />
          <SoulButton
            label="Not yet"
            variant="ghost"
            onPress={() => void answer(false)}
            loading={busy === 'no'}
            disabled={busy !== null}
            block
          />
        </View>
      }>
      <View style={styles.body}>
        <SoulText variant="section" italic accessibilityRole="header" style={styles.stretch}>
          {`Did you meet ${name}?`}
        </SoulText>
        <SoulText variant="body" tone="secondary" style={styles.stretch}>
          {`A date counts when you both say yes. Your answer stays private: ${name} only learns it if they say yes too.`}
        </SoulText>
        {note ? (
          <SoulText variant="supporting" tone="tertiary" style={styles.stretch}>
            {note}
          </SoulText>
        ) : null}
      </View>
    </SoulScreen>
  );
}

function Message({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const styles = useStyles();
  return (
    <SoulScreen
      edges={{ top: false, bottom: true }}
      footer={<SoulButton label="Done" variant="secondary" onPress={close} block />}>
      <View style={styles.body}>
        <SoulIcon name={icon} size="lg" />
        <SoulText variant="section" italic accessibilityRole="header" style={styles.stretch}>
          {title}
        </SoulText>
        <SoulText variant="body" tone="secondary" style={styles.stretch}>
          {body}
        </SoulText>
      </View>
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(() =>
  StyleSheet.create({
    body: { gap: spacing.md, paddingTop: spacing.lg },
    // Full width: shrink-wrapped serif text can lose its last word on Android.
    stretch: { alignSelf: 'stretch' },
    footer: { gap: spacing.xs },
  }),
);
