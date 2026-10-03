import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulButton } from '@/components/soul-button';
import { SoulIcon } from '@/components/soul-icon';
import { SoulAvatar } from '@/components/soul-photo';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { cardBucket } from '@/features/discovery/model/card';
import { endSession, refreshInstant, useInstantState } from '@/features/instant/api/instant';
import { Compass } from '@/features/instant/components/compass';
import {
  distanceLabel,
  distanceSpoken,
  timeLeftLabel,
  timeLeftSpoken,
  type InstantSession,
} from '@/features/instant/model/instant';
import { personName } from '@/features/matching/model/match';
import { usePhotoUrls } from '@/features/profile/api/profile';
import { createThemedStyles, sizes, spacing } from '@/theme';

function backToInstant() {
  if (router.canGoBack()) router.back();
  else router.replace('/instant');
}

/**
 * A live Instant Meet session (spec 31 to 33): the compass, a rounded distance, the time left,
 * the chat and End Meet, which is always on screen. Back leaves the session running.
 */
export function SessionScreen({ id }: { id: string }) {
  const userId = useCurrentUserId();
  const state = useInstantState(userId);
  const session = state.data?.session ?? null;

  if (state.isPending) return <LoadingState />;
  if (state.isError && !state.data) {
    return (
      <ErrorState
        title="Couldn't load your meet"
        body="Check your connection and try again."
        onRetry={() => void state.refetch()}
      />
    );
  }
  if (!session || session.id !== id || !userId) {
    return (
      <SoulScreen>
        <EmptyState
          icon="near_me"
          title="This meet has ended"
          body="Location sharing has stopped for both of you."
          action={{ label: 'Back to Instant', onPress: () => router.replace('/instant') }}
        />
      </SoulScreen>
    );
  }
  return <LiveSession session={session} userId={userId} />;
}

function LiveSession({ session, userId }: { session: InstantSession; userId: string }) {
  const styles = useStyles();
  const [now, setNow] = useState(() => Date.now());
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = personName(session.person);
  const photoPath = session.person.photos[0]!.path;
  const photo = usePhotoUrls(cardBucket(session.person), [photoPath]);
  const distance = distanceLabel(session);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // When the time is up the server ends the session; ask it straight away.
  const expired = new Date(session.expires_at).getTime() <= now;
  useEffect(() => {
    if (expired) void refreshInstant(userId);
  }, [expired, userId]);

  async function end() {
    setEnding(true);
    setError(null);
    try {
      await endSession();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await refreshInstant(userId);
    } catch {
      setError("Couldn't end the meet. Check your connection and try again.");
    } finally {
      setEnding(false);
    }
  }

  function openChat() {
    if (!session.conversation_id) return;
    router.push({ pathname: '/instant/chat/[id]', params: { id: session.conversation_id } });
  }

  return (
    <SoulScreen
      footer={
        <View style={styles.footer}>
          {error ? (
            <SoulText variant="supporting" align="center" role="alert">
              {error}
            </SoulText>
          ) : null}
          <View style={styles.actions}>
            <SoulButton
              label="Message"
              icon="chat_bubble"
              variant="secondary"
              onPress={openChat}
              disabled={!session.conversation_id}
              block
              containerStyle={styles.action}
            />
            <SoulButton
              label="End Meet"
              onPress={() => void end()}
              loading={ending}
              accessibilityHint="Stops sharing distance and direction for both of you"
              block
              containerStyle={styles.action}
            />
          </View>
        </View>
      }>
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back to Instant. The meet keeps going"
          onPress={backToInstant}
          style={styles.back}>
          <SoulIcon name="arrow_back" size="md" />
        </PressableScale>
        <View
          style={styles.timer}
          accessible
          accessibilityLabel={timeLeftSpoken(session.expires_at, now)}>
          <SoulIcon name="timer" size="sm" color="textSecondary" />
          <SoulText variant="label" tone="secondary" style={styles.tabular}>
            {timeLeftLabel(session.expires_at, now)}
          </SoulText>
        </View>
      </View>

      <View style={styles.person}>
        <SoulAvatar
          size="md"
          source={photo.data?.[photoPath] ? { uri: photo.data[photoPath] } : null}
          blurRadius={session.person.anonymous ? sizes.anonymousBlur : undefined}
        />
        <View style={styles.personText}>
          <SoulText variant="micro" tone="tertiary">
            MEETING
          </SoulText>
          <SoulText variant="label" numberOfLines={1}>
            {`${name}, ${session.person.age}`}
          </SoulText>
        </View>
      </View>

      <View style={styles.center}>
        <Compass bearing={session.bearing} nearby={session.nearby} located={session.located} />
        <SoulText
          variant="title"
          align="center"
          accessibilityLabel={distanceSpoken(session)}
          accessibilityLiveRegion="polite"
          style={styles.distance}>
          {distance ?? ' '}
        </SoulText>
      </View>
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(() =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: -spacing.sm,
    },
    back: {
      width: sizes.touchTarget,
      height: sizes.touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -spacing.sm,
    },
    timer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
    tabular: { fontVariant: ['tabular-nums'] },
    person: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
    personText: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', gap: spacing.lg },
    // Full width: shrink-wrapped centred serif text can lose its last word on Android.
    distance: { alignSelf: 'stretch' },
    footer: { gap: spacing.sm },
    actions: { flexDirection: 'row', gap: spacing.sm },
    action: { flex: 1 },
  }),
);
