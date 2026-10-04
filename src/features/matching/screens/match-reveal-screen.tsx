import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenStatusBar } from '@/components/screen-status-bar';
import { PressableScale } from '@/components/pressable-scale';
import { SoulButton } from '@/components/soul-button';
import { SoulIcon } from '@/components/soul-icon';
import { SoulPhoto } from '@/components/soul-photo';
import { SoulText } from '@/components/soul-text';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { cardBucket } from '@/features/discovery/model/card';
import { conversationOf, markMatchSeen, useMatch } from '@/features/matching/api/matches';
import { personName, type Match } from '@/features/matching/model/match';
import { PHOTO_BUCKET, useMyProfile, usePhotoUrls } from '@/features/profile/api/profile';
import {
  createThemedStyles,
  cssEasings,
  durations,
  layout,
  radii,
  sizes,
  spacing,
  useTheme,
} from '@/theme';

// The one rare moment that spends the delight budget (MOTION_SYSTEM): the black surface
// settles in, then the words and actions follow. No confetti, nothing loops.
const settle = {
  from: { opacity: 0, transform: [{ scale: 0.96 }] },
  to: { opacity: 1, transform: [{ scale: 1 }] },
};
const rise = {
  from: { opacity: 0, transform: [{ translateY: 12 }] },
  to: { opacity: 1, transform: [{ translateY: 0 }] },
};
const fade = { from: { opacity: 0 }, to: { opacity: 1 } };

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** "It's a match" (spec 24): a short reveal on the black brand surface, then two actions. */
export function MatchRevealScreen({ id }: { id: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const match = useMatch(id);

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
      ]}>
      <ScreenStatusBar style="light" />
      {match.isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.onMoment} accessibilityLabel="Loading" />
        </View>
      ) : match.data ? (
        <Reveal match={match.data} />
      ) : (
        <View style={styles.center}>
          <SoulText
            variant="subheading"
            align="center"
            style={[styles.stretch, { color: colors.onMoment }]}>
            {match.isError ? "Couldn't load this match" : "This match isn't available"}
          </SoulText>
          <SoulButton
            label={match.isError ? 'Try again' : 'Close'}
            variant="moment"
            onPress={match.isError ? () => void match.refetch() : close}
          />
        </View>
      )}
    </View>
  );
}

function Reveal({ match }: { match: Match }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const userId = useCurrentUserId();
  const reducedMotion = useReducedMotion();
  const me = useMyProfile(userId);
  const myPath = me.data?.photos.find((photo) => photo.status !== 'rejected')?.storage_path;
  const mine = usePhotoUrls(PHOTO_BUCKET, myPath ? [myPath] : []);
  const theirPath = match.person.photos[0]!.path;
  const theirs = usePhotoUrls(cardBucket(match.person), [theirPath]);
  const name = personName(match.person);

  // The match is no longer "new" for this person once they have seen the reveal. The first
  // showing is the match moment itself: one success haptic, with the reveal (never on a replay).
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current || match.seen || !userId) return;
    marked.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    void markMatchSeen(userId, match.id).catch(() => {});
  }, [match.id, match.seen, userId]);

  const enter = (keyframes: typeof rise | typeof settle, delay: number) => ({
    animationName: reducedMotion ? fade : keyframes,
    animationDuration: `${durations.reveal}ms` as const,
    animationDelay: `${delay}ms` as const,
    animationTimingFunction: cssEasings.out,
    animationFillMode: 'both' as const,
  });

  const [opening, setOpening] = useState(false);

  async function message() {
    if (opening) return;
    setOpening(true);
    const conversation = await conversationOf(match).catch(() => null);
    setOpening(false);
    if (conversation) {
      router.replace({ pathname: '/chat/[id]', params: { id: conversation } });
    } else {
      close();
      router.navigate('/chats');
    }
  }

  return (
    <>
      <View style={styles.center}>
        <Animated.View style={[styles.photos, enter(settle, 0)]}>
          <SoulPhoto
            source={myPath && mine.data?.[myPath] ? { uri: mine.data[myPath] } : null}
            style={[styles.photo, styles.photoLeft]}
            accessibilityLabel="Your photo"
          />
          <SoulPhoto
            source={theirs.data?.[theirPath] ? { uri: theirs.data[theirPath] } : null}
            blurRadius={match.person.anonymous ? sizes.anonymousBlur : undefined}
            style={[styles.photo, styles.photoRight]}
            accessibilityLabel={`${name}'s photo`}
          />
          <View style={styles.heart}>
            <SoulIcon name="favorite" size="md" color="accentOnMoment" weight="regular" />
          </View>
        </Animated.View>
        <Animated.View style={[styles.copy, enter(rise, 140)]}>
          <SoulText
            variant="title"
            italic
            align="center"
            accessibilityRole="header"
            style={{ color: colors.onMoment }}>
            It&apos;s a match
          </SoulText>
          <SoulText align="center" style={{ color: colors.onMomentSecondary }}>
            {match.person.anonymous || !match.person.name
              ? 'You both like each other.'
              : `You and ${match.person.name} like each other.`}
          </SoulText>
        </Animated.View>
      </View>
      <Animated.View style={[styles.actions, enter(rise, 260)]}>
        <SoulButton
          label="Message"
          variant="moment"
          block
          loading={opening}
          onPress={() => void message()}
        />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Continue"
          onPress={close}
          style={styles.secondary}>
          <SoulText variant="button" style={{ color: colors.onMoment }}>
            Continue
          </SoulText>
        </PressableScale>
      </Animated.View>
    </>
  );
}

const TILT = '3deg';

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.moment, paddingHorizontal: layout.screenGutter },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
    photos: { flexDirection: 'row', justifyContent: 'center', width: '100%' },
    photo: { width: '42%', borderWidth: 2, borderColor: colors.moment },
    photoLeft: { transform: [{ rotate: `-${TILT}` }], marginRight: -spacing.sm },
    photoRight: { transform: [{ rotate: TILT }], marginLeft: -spacing.sm, marginTop: spacing.lg },
    heart: {
      position: 'absolute',
      bottom: -spacing.md,
      alignSelf: 'center',
      width: sizes.touchTarget,
      height: sizes.touchTarget,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.moment,
    },
    // Full width: shrink-wrapped centred serif text can lose its last word on Android.
    copy: { gap: spacing.sm, alignSelf: 'stretch' },
    stretch: { alignSelf: 'stretch' },
    actions: { gap: spacing.xs },
    secondary: {
      minHeight: sizes.touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);
