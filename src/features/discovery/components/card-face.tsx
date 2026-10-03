import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import { HotPersonBadge, VerifiedBadge } from '@/components/badges';
import { PhotoScrim } from '@/components/photo-scrim';
import { SoulPhoto } from '@/components/soul-photo';
import { SoulText } from '@/components/soul-text';
import { usePhotoUrls } from '@/features/profile/api/profile';
import { cardBucket, type DiscoveryCard } from '@/features/discovery/model/card';
import { borders, createThemedStyles, layout, radii, sizes, spacing } from '@/theme';

type Props = {
  card: DiscoveryCard;
  likeStampStyle: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
  passStampStyle: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
};

/**
 * The card's face: the main photo full-bleed (photography leads, D-004), a bottom fade, and
 * only the identity and hook. Everything else lives in the full profile.
 */
export function CardFace({ card, likeStampStyle, passStampStyle }: Props) {
  const styles = useStyles();
  const main = card.photos[0]!.path;
  const urls = usePhotoUrls(cardBucket(card), [main]);
  const uri = urls.data?.[main];

  return (
    <View style={styles.root}>
      <SoulPhoto
        source={uri ? { uri } : null}
        rounded={false}
        aspectRatio={null}
        blurRadius={card.anonymous ? sizes.anonymousBlur : undefined}
        recyclingKey={card.id}
        style={StyleSheet.absoluteFill}
        accessibilityLabel={card.anonymous ? 'Blurred photo' : 'Main photo'}
      />
      <PhotoScrim />

      <Animated.View style={[styles.stamp, styles.likeStamp, likeStampStyle]} pointerEvents="none">
        <SoulText variant="label" style={styles.likeText}>
          LIKE
        </SoulText>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.passStamp, passStampStyle]} pointerEvents="none">
        <SoulText variant="label" tone="onPhoto">
          PASS
        </SoulText>
      </Animated.View>

      <View style={styles.info} pointerEvents="none">
        <View style={styles.titleRow}>
          <SoulText variant="section" tone="onPhoto" numberOfLines={1} style={styles.title}>
            {card.anonymous || !card.name ? 'Anonymous' : card.name}
          </SoulText>
          <SoulText variant="section" tone="onPhoto" style={styles.age}>
            {`, ${card.age}`}
          </SoulText>
          <View style={styles.badges}>
            {card.verified ? <VerifiedBadge onPhoto /> : null}
            {card.hot_person ? <HotPersonBadge onPhoto /> : null}
          </View>
        </View>
        {card.hook ? (
          <SoulText variant="subheading" italic tone="onPhoto" numberOfLines={2}>
            {card.hook}
          </SoulText>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.skeleton },
    info: {
      position: 'absolute',
      left: layout.screenGutter,
      right: layout.screenGutter,
      bottom: layout.screenGutter,
      gap: spacing.xxs,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center' },
    badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
    age: { flexShrink: 0, marginRight: spacing.xs },
    title: { flexShrink: 1 },
    stamp: {
      position: 'absolute',
      top: layout.screenGutter,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.sm,
      borderWidth: borders.strong,
    },
    likeStamp: {
      left: layout.screenGutter,
      borderColor: colors.accent,
      backgroundColor: colors.accent,
    },
    likeText: { color: colors.onAccent },
    passStamp: {
      right: layout.screenGutter,
      borderColor: colors.onPhoto,
      backgroundColor: colors.photoScrim,
    },
  }),
);
