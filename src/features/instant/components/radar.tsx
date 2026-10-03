import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { SoulIcon } from '@/components/soul-icon';
import { borders, createThemedStyles, layout, radii, sizes } from '@/theme';

// Rings widening from the centre while Instant looks for people nearby. A CSS animation on
// the UI thread; three still rings under reduced motion.
const widen = {
  from: { transform: [{ scale: 0.25 }], opacity: 0.9 },
  to: { transform: [{ scale: 1 }], opacity: 0 },
};
const RINGS = [0, 1, 2] as const;
const CYCLE_MS = 3600;

/** The searching state of the Instant compass dial. Never shows where anyone is. */
export function Radar() {
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  // Numeric: a percentage width with an aspect ratio draws an oval on Android.
  const size = Math.round(Math.min((width - layout.screenGutter * 2) * 0.72, sizes.compassMax));
  return (
    <View
      style={[styles.dial, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {RINGS.map((ring) => (
        <Animated.View
          key={ring}
          style={[
            styles.ring,
            reducedMotion
              ? { transform: [{ scale: (ring + 1) / RINGS.length }], opacity: 0.6 }
              : {
                  animationName: widen,
                  animationDuration: `${CYCLE_MS}ms`,
                  animationDelay: `${(ring * CYCLE_MS) / RINGS.length}ms`,
                  animationIterationCount: 'infinite',
                  animationTimingFunction: 'linear',
                  opacity: 0,
                },
          ]}
        />
      ))}
      <SoulIcon name="near_me" size="xl" />
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    dial: {
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.full,
      borderWidth: borders.thin,
      borderColor: colors.border,
    },
    ring: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      borderRadius: radii.full,
      borderWidth: borders.thin,
      borderColor: colors.textTertiary,
    },
  }),
);
