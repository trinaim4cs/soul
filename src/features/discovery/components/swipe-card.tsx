import { forwardRef, useImperativeHandle, useMemo } from 'react';
import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { CardFace } from '@/features/discovery/components/card-face';
import {
  cardTitle,
  type DiscoveryCard,
  type SwipeDirection,
} from '@/features/discovery/model/card';
import { easings, radii, springs, swipe } from '@/theme';

export type SwipeCardHandle = {
  /** Button path: animates the card out, then commits (same as a swipe). */
  swipe: (direction: SwipeDirection) => void;
};

type Props = {
  card: DiscoveryCard;
  /** Only the top card takes gestures; the next one sits underneath. */
  position: 'top' | 'next';
  /** 0 when the top card is at rest, 1 when it passes the commit line (drives the next card). */
  progress: SharedValue<number>;
  onDecide: (card: DiscoveryCard, direction: SwipeDirection) => void;
  onOpen: (card: DiscoveryCard) => void;
};

/** Where a flick would come to rest if it kept decelerating (Apple's decay form). */
function project(velocity: number) {
  'worklet';
  return ((velocity / 1000) * swipe.deceleration) / (1 - swipe.deceleration);
}

/**
 * Discover card. The finger drives translation directly on the UI thread; release hands the
 * velocity to either a fly-out (commit) or a damped spring home. A new touch mid-flight picks
 * the card up from where it is.
 */
export const SwipeCard = forwardRef<SwipeCardHandle, Props>(function SwipeCard(
  { card, position, progress, onDecide, onOpen },
  ref,
) {
  const reducedMotion = useReducedMotion();
  const width = useSharedValue(360);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const leaving = useSharedValue(false);
  const isTop = position === 'top';

  const commit = (direction: SwipeDirection) => onDecide(card, direction);

  function flyOut(direction: SwipeDirection, velocityX: number, velocityY: number) {
    'worklet';
    if (leaving.get()) return;
    leaving.set(true);
    const sign = direction === 'like' ? 1 : -1;
    const target = sign * width.get() * 1.5;
    const remaining = Math.abs(target - x.get());
    const speed = Math.max(Math.abs(velocityX), 1);
    const duration = Math.min(
      swipe.flyOutMax,
      Math.max(swipe.flyOutMin, (remaining / speed) * 1000),
    );
    y.set(
      withTiming(y.get() + velocityY * (duration / 1000) * 0.5, { duration, easing: easings.out }),
    );
    x.set(
      withTiming(target, { duration, easing: easings.out }, (finished) => {
        if (finished) scheduleOnRN(commit, direction);
      }),
    );
  }

  useImperativeHandle(ref, () => ({
    swipe: (direction) => {
      const sign = direction === 'like' ? 1 : -1;
      // Buttons send the card off with a brisk synthetic velocity.
      flyOut(direction, sign * 2400, 0);
    },
  }));

  // The top card tells the card underneath how far it has travelled.
  useAnimatedReaction(
    () => (isTop ? Math.min(1, Math.abs(x.get()) / (width.get() * swipe.commitShare)) : null),
    (value) => {
      if (value !== null) progress.set(value);
    },
    [isTop],
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(isTop)
      .minDistance(6)
      .onStart(() => {
        if (leaving.get()) return;
        startX.set(x.get());
        startY.set(y.get());
      })
      .onUpdate((event) => {
        if (leaving.get()) return;
        x.set(startX.get() + event.translationX);
        y.set(startY.get() + event.translationY);
      })
      .onEnd((event) => {
        if (leaving.get()) return;
        // Decide from the release event itself: the last update can trail it by a frame
        // when the phone is busy (right after launch), which used to drop real swipes.
        const releaseX = startX.get() + event.translationX;
        x.set(releaseX);
        y.set(startY.get() + event.translationY);
        const landing = releaseX + project(event.velocityX);
        const line = width.get() * swipe.commitShare;
        if (landing > line) flyOut('like', event.velocityX, event.velocityY);
        else if (landing < -line) flyOut('pass', event.velocityX, event.velocityY);
        else {
          x.set(withSpring(0, { ...springs.release, velocity: event.velocityX }));
          y.set(withSpring(0, { ...springs.release, velocity: event.velocityY }));
        }
      });
    const tap = Gesture.Tap()
      .enabled(isTop)
      .maxDistance(8)
      .onEnd((_event, success) => {
        if (success && !leaving.get()) scheduleOnRN(onOpen, card);
      });
    return Gesture.Exclusive(pan, tap);
    // Handlers read shared values; only the card, position and callbacks change them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTop, card, onOpen, onDecide]);

  const animatedStyle = useAnimatedStyle(() => {
    if (!isTop) {
      const scale = interpolate(progress.get(), [0, 1], [swipe.nextScale, 1], Extrapolation.CLAMP);
      return { transform: [{ scale }] };
    }
    const rotate = reducedMotion
      ? 0
      : interpolate(
          x.get(),
          [-width.get(), 0, width.get()],
          [-swipe.maxRotationDeg, 0, swipe.maxRotationDeg],
        );
    return {
      opacity: reducedMotion && leaving.get() ? 0 : 1,
      transform: [{ translateX: x.get() }, { translateY: y.get() }, { rotate: `${rotate}deg` }],
    };
  });

  const likeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(
      x.get(),
      [0, width.get() * swipe.commitShare],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));
  const passStamp = useAnimatedStyle(() => ({
    opacity: interpolate(
      x.get(),
      [-width.get() * swipe.commitShare, 0],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const onLayout = (event: LayoutChangeEvent) => width.set(event.nativeEvent.layout.width);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.card, animatedStyle]}
        onLayout={onLayout}
        pointerEvents={isTop ? 'auto' : 'none'}
        accessible={isTop}
        accessibilityRole="button"
        accessibilityLabel={`${cardTitle(card)}${card.hook ? `. ${card.hook}` : ''}`}
        accessibilityHint="Opens the full profile. Use the Like and Pass buttons below to decide."
        accessibilityActions={[
          { name: 'activate' },
          { name: 'like', label: 'Like' },
          { name: 'pass', label: 'Pass' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'activate') onOpen(card);
          else if (event.nativeEvent.actionName === 'like') flyOut('like', 2400, 0);
          else if (event.nativeEvent.actionName === 'pass') flyOut('pass', -2400, 0);
        }}
        importantForAccessibility={isTop ? 'yes' : 'no-hide-descendants'}
        // The card underneath is decoration until it becomes the top card (web screen readers too).
        aria-hidden={!isTop}>
        <CardFace card={card} likeStampStyle={likeStamp} passStampStyle={passStamp} />
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, overflow: 'hidden' },
});
