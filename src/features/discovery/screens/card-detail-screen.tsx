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
import { unmatch, useMatches } from '@/features/matching/api/matches';
import { UnmatchButton, UnmatchConfirm } from '@/features/matching/components/unmatch-control';
import { personName } from '@/features/matching/model/match';
import { useSwipeBalance } from '@/features/swipes/api/swipes';
import { usePhotoUrls } from '@/features/profile/api/profile';
import { ProfileView } from '@/features/profile/components/profile-view';
import { queryClient } from '@/lib/query-client';
import { spacing } from '@/theme';

/**
 * A candidate's full profile, opened from the card (spec 16: vertical, photography first).
 * Uses the card already in the deck; if the app was reopened on this page, the server
 * checks visibility again (`get_profile_card`). A match's profile opens the same way and
 * offers Unmatch instead of Pass and Like.
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
  const card = cached ?? remote.data?.card ?? null;
  const matchId = remote.data?.matchId ?? null;

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
  return <CardDetail card={card} fromDeck={Boolean(cached)} matchId={matchId} />;
}

type DetailProps = { card: DiscoveryCard; fromDeck: boolean; matchId: string | null };

function CardDetail({ card, fromDeck, matchId }: DetailProps) {
  const userId = useCurrentUserId();
  const decide = useDeckStore((state) => state.decide);
  const urls = usePhotoUrls(cardBucket(card), cardPhotoPaths(card));
  const chosen = useRef(false);
  const swipes = useSwipeBalance(userId);
  const [confirmingUnmatch, setConfirmingUnmatch] = useState(false);
  const conversationId =
    useMatches(matchId ? userId : null).data?.find((match) => match.id === matchId)
      ?.conversation_id ?? null;

  async function endMatch() {
    if (!userId || !matchId) return;
    await unmatch(userId, matchId);
    // The server no longer shows this person to the caller.
    queryClient.removeQueries({ queryKey: ['profile-card', card.id] });
    // Straight to the chat list: the chat this profile was opened from no longer exists.
    if (router.canDismiss()) router.dismissAll();
    router.navigate('/chats');
  }

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
        ) : matchId && confirmingUnmatch ? (
          <UnmatchConfirm
            name={personName(card)}
            onCancel={() => setConfirmingUnmatch(false)}
            onUnmatch={endMatch}
          />
        ) : conversationId ? (
          <SoulButton
            label="Message"
            block
            onPress={() =>
              router.navigate({ pathname: '/chat/[id]', params: { id: conversationId } })
            }
          />
        ) : null
      }>
      <ProfileView profile={toProfileView(card, urls.data)} />
      {matchId && !confirmingUnmatch ? (
        <UnmatchButton onPress={() => setConfirmingUnmatch(true)} />
      ) : null}
      <SoulButton
        label="Report or block"
        variant="ghost"
        size="sm"
        inline
        onPress={() =>
          router.push({
            pathname: '/safety/[id]',
            params: {
              id: card.id,
              name: personName(card),
              context: fromDeck ? 'discovery' : 'profile',
              ...(matchId ? { match: matchId } : {}),
            },
          })
        }
      />
    </SoulScreen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
