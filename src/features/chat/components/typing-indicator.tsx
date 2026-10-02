import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { createThemedStyles, durations, radii, spacing } from '@/theme';

// Three dots breathing one after another (MOTION_SYSTEM: staggered opacity, `durations.base`
// per beat). A CSS animation on the UI thread; under reduced motion the dots are still.
const breathe = { from: { opacity: 0.25 }, '40%': { opacity: 1 }, to: { opacity: 0.25 } };
const DOTS = [0, 1, 2] as const;
const CYCLE = durations.base * 4;

/** "The other person is typing", in the shape of one of their bubbles. */
export function TypingIndicator({ name }: { name: string }) {
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  return (
    <View
      style={styles.bubble}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${name} is typing`}>
      {DOTS.map((dot) => (
        <Animated.View
          key={dot}
          style={[
            styles.dot,
            reducedMotion
              ? null
              : {
                  animationName: breathe,
                  animationDuration: `${CYCLE}ms`,
                  animationDelay: `${dot * (durations.base / 2)}ms`,
                  animationIterationCount: 'infinite',
                  animationTimingFunction: 'ease-in-out',
                },
          ]}
        />
      ))}
    </View>
  );
}

const DOT = spacing.xs;

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    bubble: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
      marginTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      borderBottomLeftRadius: radii.xs,
      backgroundColor: colors.surfaceSubtle,
    },
    dot: {
      width: DOT,
      height: DOT,
      borderRadius: radii.full,
      backgroundColor: colors.textSecondary,
    },
  }),
);
