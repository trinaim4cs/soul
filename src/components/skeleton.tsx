import { type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { radii, useTheme } from '@/theme';

type Props = {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

const pulse = {
  from: { opacity: 1 },
  '50%': { opacity: 0.55 },
  to: { opacity: 1 },
};

/**
 * Loading placeholder that mirrors the final layout. A slow opacity pulse (CSS animation,
 * UI thread); static under reduced motion.
 */
export function Skeleton({ width = '100%', height, radius = radii.sm, style }: Props) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius, backgroundColor: colors.skeleton },
        reducedMotion
          ? null
          : {
              animationName: pulse,
              animationDuration: '1400ms',
              animationIterationCount: 'infinite',
              animationTimingFunction: 'ease-in-out',
            },
        style,
      ]}
    />
  );
}
