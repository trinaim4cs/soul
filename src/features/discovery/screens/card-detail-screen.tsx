import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulScreen } from '@/components/soul-screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { fetchProfileCard } from '@/features/discovery/api/discovery';
import {
  cardBucket,
  cardPhotoPaths,
  toProfileView,
  type DiscoveryCard,
  type SwipeDirection,
} from '@/features/discovery/model/card';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { useDeckStore } from '@/features/discovery/store/deck-store';
import { useSwipeBalance } from '@/features/swipes/api/swipes';
import { usePhotoUrls } from '@/features/profile/api/profile';
import { ProfileView } from '@/features/profile/components/profile-view';
import { spacing } from '@/theme';

/**
 * A candidate's full profile, opened from the card (spec 16: vertical, photography first).
 * Uses the card already in the deck; if the app was reopened on this page, the server
 * checks visibility again (`get_profile_card`).
 */
export function CardDetailScreen({ id }: { id: string }) {
  // The card as it was when the page opened. Liking or passing removes it from the deck,
  // and the page must not reload or change while it slides away.
  const [cached] = useState(() => useDeckStore.getState().cardById(id));
  const remote = useQuery({
    queryKey: ['profile-card', id],
    queryFn: () => fetchProfileCard(id),
    enabled: !cached,
  });
  const card = cached ?? remote.data ?? null;

  if (!cached && remote.isPending) return <LoadingState />;
  if (!cached && remote.isError) {
    return (
      <ErrorState
        title="Couldn't load this profile"
        body="Check your connection and try again."
        onRetry={() => void remote.refetch()}
      />
    );
  }
  if (!card) {
    return (
      <EmptyState
        icon="person"
        title="This profile isn't available"
        body="They may have paused their profile or changed who they want to meet."
        action={{ label: 'Back to Discover', onPress: () => router.replace('/') }}
      />
    );
  }
  return <CardDetail card={card} fromDeck={Boolean(cached)} />;
}

function CardDetail({ card, fromDeck }: { card: DiscoveryCard; fromDeck: boolean }) {
  const decide = useDeckStore((state) => state.decide);
  const urls = usePhotoUrls(cardBucket(card), cardPhotoPaths(card));
  const chosen = useRef(false);
  const swipes = useSwipeBalance(useCurrentUserId());

  function choose(direction: SwipeDirection) {
    // Out of likes: offer plans and keep the profile open (passing still works).
    if (direction === 'like' && swipes.data?.balance === 0) {
      router.push('/paywall');
      return;
    }
    // One decision per visit: a double tap must not save twice or go back twice.
    if (chosen.current) return;
    chosen.current = true;
    void decide(card, direction);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <SoulScreen
      scroll
      edges={{ top: false, bottom: true }}
      footer={
        fromDeck ? (
          <View style={styles.actions}>
            <SoulButton
              label="Pass"
              icon="close"
              variant="secondary"
              block
              containerStyle={styles.action}
              onPress={() => choose('pass')}
            />
            <SoulButton
              label="Like"
              icon="favorite"
              variant="accent"
              block
              containerStyle={styles.action}
              onPress={() => choose('like')}
            />
          </View>
        ) : null
      }>
      <ProfileView profile={toProfileView(card, urls.data)} />
    </SoulScreen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
