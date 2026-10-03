import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulButton } from '@/components/soul-button';
import { SoulChip } from '@/components/soul-chip';
import { SoulIcon, type IconName } from '@/components/soul-icon';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { EmptyState, ErrorState, LoadingState, PermissionState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { cardBucket } from '@/features/discovery/model/card';
import {
  acceptCandidate,
  refreshInstant,
  skipCandidate,
  startInstant,
  stopInstant,
  useInstantCandidates,
  useInstantState,
} from '@/features/instant/api/instant';
import { CandidateCard } from '@/features/instant/components/candidate-card';
import { Radar } from '@/features/instant/components/radar';
import {
  distanceLabel,
  INSTANT_DURATIONS,
  timeLeftLabel,
  timeLeftSpoken,
  type InstantCandidate,
  type InstantDuration,
  type InstantSession,
  type InstantState,
} from '@/features/instant/model/instant';
import { useInstantStore } from '@/features/instant/store/instant-store';
import { personName } from '@/features/matching/model/match';
import { BLURRED_BUCKET, PHOTO_BUCKET, usePhotoUrls } from '@/features/profile/api/profile';
import { usePlans } from '@/features/swipes/api/swipes';
import { location } from '@/services/location';
import { createThemedStyles, radii, sizes, spacing } from '@/theme';

/** "A", "A and B", "A, B and C". */
function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * The Instant tab (spec 26 to 30): the plan gate, turning Instant on for 15, 30 or 60
 * minutes, people within 1 km who also have it on, and the way back into a live meet. The
 * server decides all of it; this screen only asks and shows.
 */
export function InstantScreen() {
  const userId = useCurrentUserId();
  const state = useInstantState(userId);

  useFocusEffect(
    useCallback(() => {
      if (userId) void refreshInstant(userId);
    }, [userId]),
  );

  if (state.isPending) return <LoadingState />;
  if (state.isError && state.data === undefined) {
    return (
      <SoulScreen edges={{ top: true, bottom: false }}>
        <ErrorState
          title="Couldn't load Instant Meet"
          body="Check your connection and try again."
          onRetry={() => void state.refetch()}
        />
      </SoulScreen>
    );
  }
  if (!state.data || !userId) {
    return (
      <SoulScreen edges={{ top: true, bottom: false }}>
        <EmptyState
          icon="near_me"
          title="Instant Meet isn't available"
          body="Finish your profile first, then come back here."
        />
      </SoulScreen>
    );
  }
  const data = state.data;
  if (data.session) return <LiveMeet session={data.session} />;
  if (!data.entitled) return <Gate />;
  if (!data.active) return <Setup userId={userId} />;
  return <Searching userId={userId} state={data} />;
}

function Header({ title, children }: { title: string; children?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <SoulText variant="title" accessibilityRole="header" style={styles.headerTitle}>
        {title}
      </SoulText>
      {children}
    </View>
  );
}

function Point({ icon, text }: { icon: IconName; text: string }) {
  const styles = useStyles();
  return (
    <View style={styles.point}>
      <SoulIcon name={icon} size="md" color="textSecondary" />
      <SoulText variant="body" tone="secondary" style={styles.pointText}>
        {text}
      </SoulText>
    </View>
  );
}

const PRIVACY_POINTS: { icon: IconName; text: string }[] = [
  { icon: 'near_me', text: 'Only people within 1 km who also turned Instant on can find you.' },
  {
    icon: 'visibility_off',
    text: 'Nobody sees where you are. Once you both say yes, you each see a rough distance and direction.',
  },
  {
    icon: 'location_off',
    text: 'Your location is used only while Instant is on, and is deleted when it ends.',
  },
];

/** Not on a plan with Instant Meet: what it is, and the way to the plans. */
function Gate() {
  const styles = useStyles();
  const plans = usePlans();
  const names = (plans.data ?? [])
    .filter((plan) => plan.kind === 'subscription' && plan.includes_instant)
    .map((plan) => plan.title);
  return (
    <SoulScreen
      scroll
      edges={{ top: true, bottom: false }}
      footer={<SoulButton label="See plans" onPress={() => router.push('/paywall')} block />}>
      <Header title="Instant" />
      <SoulText variant="section" italic style={styles.lede}>
        Meet someone nearby, right now.
      </SoulText>
      <SoulText variant="body" tone="secondary">
        {names.length > 0
          ? `Instant Meet comes with the ${listJoin(names)} plans.`
          : 'Instant Meet comes with the longer plans.'}
      </SoulText>
      <View style={styles.points}>
        {PRIVACY_POINTS.map((point) => (
          <Point key={point.icon} icon={point.icon} text={point.text} />
        ))}
      </View>
    </SoulScreen>
  );
}

type SetupProblem = 'denied' | 'unavailable' | 'failed' | null;

/** On a plan with Instant, currently off: choose how long, then turn it on. */
function Setup({ userId }: { userId: string }) {
  const styles = useStyles();
  const [minutes, setMinutes] = useState<InstantDuration>(30);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<SetupProblem>(null);
  const ended = useInstantStore((store) => store.ended);
  const clearEnded = useInstantStore((store) => store.clearEnded);
  const setLocationProblem = useInstantStore((store) => store.setLocationProblem);

  async function turnOn() {
    setBusy(true);
    setProblem(null);
    try {
      // Permission first, from this tap (browsers require it), and only now (spec 29).
      let permission = await location.getPermission();
      if (permission !== 'granted') permission = await location.requestPermission();
      if (permission === 'denied' || permission === 'undetermined') {
        setProblem('denied');
        return;
      }
      if (permission === 'unavailable') {
        setProblem('unavailable');
        return;
      }
      const result = await startInstant(minutes);
      if (!result.ok && result.reason !== 'in_session') setProblem('failed');
      setLocationProblem(null);
      clearEnded();
      await refreshInstant(userId);
    } catch {
      setProblem('failed');
    } finally {
      setBusy(false);
    }
  }

  if (problem === 'denied') {
    return (
      <SoulScreen edges={{ top: true, bottom: false }}>
        <PermissionState
          icon="location_off"
          title="Instant Meet needs your location"
          body={`${location.settingsHint} It is used only while Instant is on.`}
          allowLabel="Try again"
          onAllow={() => void turnOn()}
          onOpenSettings={location.openSettings}
        />
      </SoulScreen>
    );
  }

  return (
    <SoulScreen
      scroll
      edges={{ top: true, bottom: false }}
      footer={
        // The duration sits with the button it applies to, so it is never below the fold.
        <View style={styles.footer}>
          <SoulText variant="label">Stay available for</SoulText>
          <View style={styles.durations} role="radiogroup" accessibilityLabel="Stay available for">
            {INSTANT_DURATIONS.map((option) => (
              <SoulChip
                key={option}
                label={`${option} min`}
                selected={minutes === option}
                onPress={() => setMinutes(option)}
                fill
              />
            ))}
          </View>
          {problem ? (
            <SoulText variant="supporting" align="center" role="alert">
              {problem === 'unavailable'
                ? "Location isn't available on this device."
                : "Couldn't turn Instant on. Check your connection and try again."}
            </SoulText>
          ) : null}
          <SoulButton label="Turn on Instant" onPress={() => void turnOn()} loading={busy} block />
        </View>
      }>
      <Header title="Instant" />
      {ended ? (
        <View style={styles.notice}>
          <View style={styles.noticeText}>
            <SoulText variant="supporting" tone="secondary">
              {`Your meet with ${ended.name} has ended. Location sharing stopped for both of you.`}
            </SoulText>
            <SoulButton
              label="Did you meet?"
              variant="secondary"
              size="sm"
              onPress={() => router.push({ pathname: '/date/[id]', params: { id: ended.id } })}
            />
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={clearEnded}
            style={styles.dismiss}>
            <SoulIcon name="close" size="sm" color="textSecondary" />
          </PressableScale>
        </View>
      ) : null}
      <SoulText variant="section" italic style={styles.lede}>
        Who&apos;s around, right now?
      </SoulText>
      <View style={styles.points}>
        {PRIVACY_POINTS.map((point) => (
          <Point key={point.icon} icon={point.icon} text={point.text} />
        ))}
      </View>
    </SoulScreen>
  );
}

/** Instant is on: who is nearby, or the radar while nobody is yet. */
function Searching({ userId, state }: { userId: string; state: InstantState }) {
  const styles = useStyles();
  const locationProblem = useInstantStore((store) => store.locationProblem);
  const candidates = useInstantCandidates(userId, state.located);
  const [busy, setBusy] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const list = state.located ? (candidates.data ?? []) : [];

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const until = state.active_until;
  const expired = until !== null && new Date(until).getTime() <= now;
  useEffect(() => {
    if (expired) void refreshInstant(userId);
  }, [expired, userId]);

  const mainPhoto = (candidate: InstantCandidate) => candidate.photos[0]!.path;
  const originals = usePhotoUrls(
    PHOTO_BUCKET,
    list.filter((item) => cardBucket(item) === PHOTO_BUCKET).map(mainPhoto),
  );
  const blurred = usePhotoUrls(
    BLURRED_BUCKET,
    list.filter((item) => cardBucket(item) === BLURRED_BUCKET).map(mainPhoto),
  );
  const photoUrl = (candidate: InstantCandidate) =>
    (cardBucket(candidate) === PHOTO_BUCKET ? originals : blurred).data?.[mainPhoto(candidate)];

  async function act(candidate: InstantCandidate, accept: boolean) {
    setBusy(candidate.id);
    try {
      // A session that starts here opens on both phones (useInstantPresence).
      await (accept ? acceptCandidate(candidate.id) : skipCandidate(candidate.id));
    } catch {
      // Nothing changed on the server; the card stays.
    } finally {
      await refreshInstant(userId);
      setBusy(null);
    }
  }

  async function turnOff() {
    setStopping(true);
    try {
      await stopInstant();
      await refreshInstant(userId);
    } finally {
      setStopping(false);
    }
  }

  return (
    <SoulScreen scroll edges={{ top: true, bottom: false }}>
      <Header title="Instant">
        <SoulButton
          label="Turn off"
          variant="ghost"
          size="sm"
          inline
          onPress={() => void turnOff()}
          loading={stopping}
          accessibilityHint="Stops Instant Meet and deletes your location"
        />
      </Header>
      <View
        style={styles.status}
        accessible
        accessibilityLabel={`Instant is on. ${until ? timeLeftSpoken(until, now) : ''}`}>
        <View style={styles.onDot} />
        <SoulText variant="label">Instant is on</SoulText>
        {until ? (
          <SoulText variant="label" tone="tertiary" style={styles.tabular}>
            {`· ${timeLeftLabel(until, now)} left`}
          </SoulText>
        ) : null}
      </View>

      {locationProblem === 'denied' ? (
        <PermissionState
          icon="location_off"
          title="Location is off for SOUL"
          body="Nobody nearby can find you until you allow it again."
          onOpenSettings={location.openSettings}
        />
      ) : list.length === 0 ? (
        <View style={styles.searching}>
          <Radar />
          <SoulText variant="subheading" italic align="center" style={styles.stretch}>
            {state.located ? 'Looking for people nearby' : 'Finding your location…'}
          </SoulText>
          <SoulText variant="supporting" tone="secondary" align="center" style={styles.stretch}>
            {locationProblem === 'unavailable'
              ? "Your location isn't coming through. Check that location is turned on."
              : 'When someone within 1 km turns Instant on, they show up here. Nobody sees where you are.'}
          </SoulText>
        </View>
      ) : (
        <View style={styles.list}>
          <SoulText variant="supporting" tone="secondary">
            Nearby with Instant on. Say yes to someone, and if they say yes too, you both get a
            compass to find each other.
          </SoulText>
          {list.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              photoUrl={photoUrl(candidate)}
              busy={busy === candidate.id}
              onAccept={() => void act(candidate, true)}
              onSkip={() => void act(candidate, false)}
            />
          ))}
        </View>
      )}
    </SoulScreen>
  );
}

/** A meet is live: the way back to its compass (the session keeps going on other screens). */
function LiveMeet({ session }: { session: InstantSession }) {
  const styles = useStyles();
  const name = personName(session.person);
  const distance = distanceLabel(session);
  return (
    <SoulScreen edges={{ top: true, bottom: false }}>
      <Header title="Instant" />
      <View style={styles.live}>
        <SoulIcon name="navigation" size="xl" />
        <SoulText variant="section" italic align="center" style={styles.stretch}>
          {`You're meeting ${name}`}
        </SoulText>
        {distance ? (
          <SoulText variant="body" tone="secondary" align="center" style={styles.stretch}>
            {distance}
          </SoulText>
        ) : null}
        <SoulButton
          label="Open compass"
          onPress={() =>
            router.push({ pathname: '/instant/session/[id]', params: { id: session.id } })
          }
        />
      </View>
    </SoulScreen>
  );
}

const ON_DOT = spacing.xs;

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    headerTitle: { flexShrink: 1 },
    lede: { marginTop: spacing.lg, marginBottom: spacing.sm },
    points: { gap: spacing.md, marginTop: spacing.lg },
    point: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    pointText: { flex: 1 },
    durations: { flexDirection: 'row', gap: spacing.xs },
    footer: { gap: spacing.sm },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.md,
      paddingLeft: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceSubtle,
    },
    noticeText: { flex: 1, gap: spacing.sm, paddingVertical: spacing.sm },
    dismiss: {
      width: sizes.touchTarget,
      height: sizes.touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
    },
    status: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
    onDot: {
      width: ON_DOT,
      height: ON_DOT,
      borderRadius: radii.full,
      backgroundColor: colors.textPrimary,
    },
    tabular: { fontVariant: ['tabular-nums'] },
    searching: { gap: spacing.md, marginTop: spacing.xl, alignItems: 'center' },
    // Full width: shrink-wrapped centred text can lose its last word on Android.
    stretch: { alignSelf: 'stretch' },
    list: { gap: spacing.md, marginTop: spacing.lg },
    live: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  }),
);
