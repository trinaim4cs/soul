import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Skeleton } from '@/components/skeleton';
import { SoulText } from '@/components/soul-text';
import { EmptyState, ErrorState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { cardBucket } from '@/features/discovery/model/card';
import { refreshMatches, useMatches } from '@/features/matching/api/matches';
import { MatchRow } from '@/features/matching/components/match-row';
import type { Match } from '@/features/matching/model/match';
import { BLURRED_BUCKET, PHOTO_BUCKET, usePhotoUrls } from '@/features/profile/api/profile';
import { createThemedStyles, layout, radii, sizes, spacing, useTheme } from '@/theme';

const mainPhoto = (match: Match) => match.person.photos[0]!.path;

/**
 * Chats tab: every match, most recent activity first, with its last message and unread
 * count. A match that has not been seen yet opens its reveal first; the rest open the chat.
 */
export function MatchesScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const userId = useCurrentUserId();
  const matches = useMatches(userId);
  const list = matches.data ?? [];

  // Someone may have liked back while this tab was in the background.
  useFocusEffect(
    useCallback(() => {
      if (userId) void refreshMatches(userId);
    }, [userId]),
  );

  // One signing request per bucket for the whole list (anonymous matches use blurred copies).
  const originals = usePhotoUrls(
    PHOTO_BUCKET,
    list.filter((match) => cardBucket(match.person) === PHOTO_BUCKET).map(mainPhoto),
  );
  const blurred = usePhotoUrls(
    BLURRED_BUCKET,
    list.filter((match) => cardBucket(match.person) === BLURRED_BUCKET).map(mainPhoto),
  );
  const photoUrl = (match: Match) =>
    (cardBucket(match.person) === PHOTO_BUCKET ? originals : blurred).data?.[mainPhoto(match)];

  function open(match: Match) {
    if (!match.seen) router.push({ pathname: '/match/[id]', params: { id: match.id } });
    else if (match.conversation_id) {
      router.push({ pathname: '/chat/[id]', params: { id: match.conversation_id } });
    } else router.push({ pathname: '/profile/[id]', params: { id: match.person.id } });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <SoulText variant="title" accessibilityRole="header" style={styles.title}>
        Chats
      </SoulText>
      {matches.isPending ? (
        <View style={styles.loading}>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} height={sizes.avatar.md} radius={radii.md} />
          ))}
        </View>
      ) : matches.isError ? (
        <ErrorState
          title="Couldn't load your chats"
          body="Check your connection and try again."
          onRetry={() => void matches.refetch()}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon="favorite"
          title="No matches yet"
          body="When you and someone both like each other, you'll find them here."
          action={{ label: 'Go to Discover', onPress: () => router.navigate('/') }}
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(match) => match.id}
          renderItem={({ item }) => (
            <MatchRow match={item} photoUrl={photoUrl(item)} onPress={() => open(item)} />
          )}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={matches.isRefetching}
              onRefresh={() => void matches.refetch()}
              tintColor={colors.textSecondary}
              colors={[colors.textPrimary]}
              progressBackgroundColor={colors.surface}
            />
          }
        />
      )}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: layout.screenGutter },
    title: { marginBottom: spacing.md },
    loading: { gap: spacing.md, marginTop: spacing.md },
    content: { paddingBottom: spacing.xl },
  }),
);
