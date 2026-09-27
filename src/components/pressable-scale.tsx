import { useState, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { cssEasings, durations, pressFeedback } from '@/theme';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  /** Style of the visible (scaling) surface. */
  style?: StyleProp<ViewStyle>;
  /** Layout of the outer touch box (flex, percentage widths in grids). */
  containerStyle?: StyleProp<ViewStyle>;
  /** Style applied while pressed, in addition to the scale (for example a fill change). */
  pressedStyle?: StyleProp<ViewStyle>;
  /** Full-width rows highlight instead of scaling: pass `false` with a `pressedStyle`. */
  scale?: boolean;
};

/**
 * Press feedback for every button-like touchable (expo-animation recipe): feedback on
 * press-in, a 3 % scale over 120 ms with a strong ease-out, run by a Reanimated CSS
 * transition on the UI thread. Reduced motion keeps only the pressed-style change.
 * Full-width list rows should highlight instead of scaling (use `pressedStyle` + `scale={false}`).
 */
export function PressableScale({
  children,
  style,
  containerStyle,
  pressedStyle,
  disabled,
  onPressIn,
  onPressOut,
  hitSlop = 8,
  scale = true,
  ...pressableProps
}: Props) {
  const [pressed, setPressed] = useState(false);
  const reducedMotion = useReducedMotion();
  const shouldScale = scale && !reducedMotion && pressed && !disabled;

  return (
    <Pressable
      {...pressableProps}
      style={containerStyle}
      disabled={disabled}
      hitSlop={hitSlop}
      pressRetentionOffset={16}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}>
      <Animated.View
        style={[
          {
            transform: [{ scale: shouldScale ? pressFeedback.scale : 1 }],
            transitionProperty: 'transform',
            transitionDuration: durations.press,
            transitionTimingFunction: cssEasings.out,
          },
          style,
          pressed && !disabled ? pressedStyle : null,
        ]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
