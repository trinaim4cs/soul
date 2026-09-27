import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { Skeleton } from '@/components/skeleton';
import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { EmptyState, ErrorState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { SwipeCard, type SwipeCardHandle } from '@/features/discovery/components/swipe-card';
import type { DiscoveryCard, SwipeDirection } from '@/features/discovery/model/card';
import { useDeckStore } from '@/features/discovery/store/deck-store';
import { createThemedStyles, layout, radii, sizes, spacing } from '@/theme';

/** Discover (spec 21): location-independent, one decision at a time, photography first. */
export function DiscoverScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const userId = useCurrentUserId();
  const cards = useDeckStore((state) => state.cards);
  const status = useDeckStore((state) => state.status);
  const message = useDeckStore((state) => state.message);
  const start = useDeckStore((state) => state.start);
  const refresh = useDeckStore((state) => state.refresh);
  const decide = useDeckStore((state) => state.decide);
  const topRef = useRef<SwipeCardHandle>(null);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (userId) start(userId);
  }, [userId, start]);

  const onDecide = useCallback(
    (card: DiscoveryCard, direction: SwipeDirection) => {
      progress.set(0);
      void decide(card, direction);
    },
    [decide, progress],
  );
  const onOpen = useCallback((card: DiscoveryCard) => {
    router.push({ pathname: '/profile/[id]', params: { id: card.id } });
  }, []);

  const [top, next] = cards;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <SoulText variant="title" accessibilityRole="header" style={styles.title}>
          Discover
        </SoulText>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Discovery filters"
          onPress={() => router.push('/filters')}
          style={styles.iconButton}>
          <SoulIcon name="tune" size="md" />
        </PressableScale>
      </View>

      <View style={styles.deck}>
        {status === 'loading' || status === 'idle' ? (
          <Skeleton height="100%" radius={radii.lg} />
        ) : status === 'error' ? (
          <ErrorState
            title="Couldn't load profiles"
            body="Check your connection and try again."
            onRetry={() => void refresh()}
          />
        ) : status === 'not_eligible' ? (
          <EmptyState
            icon="lock"
            title="Finish your profile first"
            body="Discover opens once your profile is complete."
          />
        ) : !top ? (
          <EmptyState
            icon="style"
            title="You're all caught up"
            body="New SRM students join every day. Check back soon, or widen your filters."
            action={{ label: 'Adjust filters', onPress: () => router.push('/filters') }}
            secondaryAction={{ label: 'Refresh', onPress: () => void refresh() }}
          />
        ) : (
          <>
            {next ? (
              <SwipeCard
                key={next.id}
                card={next}
                position="next"
                progress={progress}
                onDecide={onDecide}
                onOpen={onOpen}
              />
            ) : null}
            <SwipeCard
              key={top.id}
              ref={topRef}
              card={top}
              position="top"
              progress={progress}
              onDecide={onDecide}
              onOpen={onOpen}
            />
          </>
        )}
      </View>

      <View style={styles.footer}>
        {message ? (
          <SoulText variant="supporting" tone="secondary" align="center" role="alert">
            {message}
          </SoulText>
        ) : null}
        {top ? (
          <View style={styles.actions}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Pass"
              onPress={() => topRef.current?.swipe('pass')}
              style={[styles.action, styles.pass]}>
              <SoulIcon name="close" size="lg" weight="regular" />
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Like"
              onPress={() => topRef.current?.swipe('like')}
              style={[styles.action, styles.like]}>
              <SoulIcon name="favorite" size="lg" color="onAccent" weight="regular" />
            </PressableScale>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const ACTION_SIZE = sizes.avatar.md + spacing.xs;

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: layout.screenGutter },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    title: { flex: 1 },
    iconButton: {
      width: sizes.touchTarget,
      height: sizes.touchTarget,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSubtle,
    },
    deck: { flex: 1 },
    footer: { gap: spacing.sm, paddingVertical: spacing.md },
    actions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl },
    action: {
      width: ACTION_SIZE,
      height: ACTION_SIZE,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pass: { backgroundColor: colors.surfaceSubtle },
    like: { backgroundColor: colors.accent },
  }),
);
