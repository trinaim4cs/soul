import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulPhoto } from '@/components/soul-photo';
import { SoulText } from '@/components/soul-text';
import { cardTitle } from '@/features/discovery/model/card';
import type { InstantCandidate } from '@/features/instant/model/instant';
import { personName } from '@/features/matching/model/match';
import { createThemedStyles, radii, sizes, spacing } from '@/theme';

type Props = {
  candidate: InstantCandidate;
  photoUrl: string | undefined;
  busy: boolean;
  onAccept: () => void;
  onSkip: () => void;
};

/**
 * Someone within 1 km who also has Instant on. Deliberately no distance and no direction:
 * nothing about where anyone is goes out before both people accept (spec 28, 29).
 */
export function CandidateCard({ candidate, photoUrl, busy, onAccept, onSkip }: Props) {
  const styles = useStyles();
  const name = personName(candidate);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <SoulPhoto
          source={photoUrl ? { uri: photoUrl } : null}
          blurRadius={candidate.anonymous ? sizes.anonymousBlur : undefined}
          style={styles.photo}
          accessibilityLabel={`Photo of ${name}`}
        />
        <View style={styles.text}>
          <SoulText variant="subheading" numberOfLines={1}>
            {cardTitle(candidate)}
          </SoulText>
          {candidate.hook ? (
            <SoulText variant="supporting" tone="secondary" numberOfLines={3}>
              {candidate.hook}
            </SoulText>
          ) : null}
          <SoulText variant="micro" tone="tertiary">
            WITHIN 1 KM · INSTANT IS ON
          </SoulText>
        </View>
      </View>
      {candidate.accepted ? (
        <View style={styles.waiting}>
          <SoulText
            variant="supporting"
            tone="secondary"
            accessibilityLiveRegion="polite"
            style={styles.waitingText}>
            {`Waiting for ${name}. If they say yes too, the compass opens for both of you.`}
          </SoulText>
          <SoulButton label="Cancel" variant="ghost" size="sm" onPress={onSkip} disabled={busy} />
        </View>
      ) : (
        <View style={styles.actions}>
          <SoulButton
            label="Not now"
            variant="secondary"
            size="md"
            onPress={onSkip}
            disabled={busy}
            block
            containerStyle={styles.action}
          />
          <SoulButton
            label="Meet now"
            size="md"
            onPress={onAccept}
            loading={busy}
            accessibilityHint={`Shares a rough distance and direction with ${name} only if they say yes too`}
            block
            containerStyle={styles.action}
          />
        </View>
      )}
    </View>
  );
}

const PHOTO_WIDTH = 96;

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    row: { flexDirection: 'row', gap: spacing.md },
    photo: { width: PHOTO_WIDTH, borderRadius: radii.md },
    text: { flex: 1, gap: spacing.xxs, justifyContent: 'center' },
    actions: { flexDirection: 'row', gap: spacing.sm },
    action: { flex: 1 },
    waiting: { gap: spacing.xs, alignItems: 'flex-start' },
    waitingText: { alignSelf: 'stretch' },
  }),
);
