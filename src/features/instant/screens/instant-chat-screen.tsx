import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulButton } from '@/components/soul-button';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { EmptyState, LoadingState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { Conversation } from '@/features/chat/screens/chat-screen';
import { endSession, refreshInstant, useInstantState } from '@/features/instant/api/instant';
import { distanceLabel } from '@/features/instant/model/instant';
import { createThemedStyles, radii, sizes, spacing } from '@/theme';

function back() {
  if (router.canGoBack()) router.back();
  else router.replace('/instant');
}

/**
 * The chat of a live Instant Meet session. It exists only while the session does: when either
 * person ends it, the server closes the conversation and this screen says so.
 */
export function InstantChatScreen({ id }: { id: string }) {
  const styles = useStyles();
  const userId = useCurrentUserId();
  const state = useInstantState(userId);
  const session = state.data?.session ?? null;
  const [ending, setEnding] = useState(false);

  async function end() {
    if (!userId) return;
    setEnding(true);
    try {
      await endSession();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await refreshInstant(userId);
    } catch {
      // Still live; the button stays for another try.
    } finally {
      setEnding(false);
    }
  }

  if (state.isPending) return <LoadingState />;
  if (!session || session.conversation_id !== id || !userId) {
    return (
      <SoulScreen>
        <EmptyState
          icon="near_me"
          title="This meet has ended"
          body="The chat closed with it."
          action={{ label: 'Back to Instant', onPress: () => router.replace('/instant') }}
        />
      </SoulScreen>
    );
  }
  const distance = distanceLabel(session);
  return (
    <Conversation
      conversationId={id}
      person={session.person}
      userId={userId}
      caption="Your Instant Meet chat closes when the meet ends."
      onBack={back}
      headerAccessory={
        <View style={styles.accessory}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Open the compass"
            onPress={() =>
              router.navigate({ pathname: '/instant/session/[id]', params: { id: session.id } })
            }
            style={styles.compass}>
            <View style={styles.pill}>
              <SoulText variant="supporting" numberOfLines={1}>
                {distance ?? 'Compass'}
              </SoulText>
            </View>
          </PressableScale>
          {/* End Meet is on screen wherever the session is (spec 33). */}
          <SoulButton
            label="End Meet"
            size="sm"
            onPress={() => void end()}
            loading={ending}
            accessibilityHint="Stops sharing distance and direction for both of you"
          />
        </View>
      }
    />
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    accessory: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginRight: spacing.xs,
    },
    compass: { minHeight: sizes.touchTarget, justifyContent: 'center' },
    pill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
      borderRadius: radii.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
    },
  }),
);
