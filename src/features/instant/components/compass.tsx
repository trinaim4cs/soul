import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { SoulButton } from '@/components/soul-button';
import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { relativeBearing, shortestRotation, smoothHeading } from '@/features/instant/model/instant';
import { heading as headingService, type HeadingAvailability } from '@/services/heading';
import { borders, createThemedStyles, layout, radii, sizes, spacing, springs } from '@/theme';

/**
 * Android reports a heading only once the phone has turned about 2 degrees, so a phone held
 * still can stay silent. After this long without a reading, ask for a small turn.
 */
const NUDGE_MS = 3_000;
/** Still nothing after this long, even after a turn: the device has no compass. */
const NO_COMPASS_MS = 15_000;
/** Compass readings arrive up to 60 times a second; the arrow needs far fewer. */
const HEADING_STEP_MS = 66;

type HeadingStatus = 'waiting' | 'idle' | HeadingAvailability;

/** The device heading, smoothed, with whether there is one at all. */
function useDeviceHeading(onHeading: (degrees: number) => void) {
  const [status, setStatus] = useState<HeadingStatus>('waiting');
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(onHeading);
  useEffect(() => {
    latest.current = onHeading;
  });

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;
    let received = false;
    let smoothed: number | null = null;
    let lastStep = 0;
    const nudge = setTimeout(() => {
      if (!received && !cancelled) setStatus('idle');
    }, NUDGE_MS);
    const giveUp = setTimeout(() => {
      if (!received && !cancelled) setStatus('unavailable');
    }, NO_COMPASS_MS);
    void headingService.availability().then((availability) => {
      if (cancelled) return;
      if (availability !== 'available') {
        clearTimeout(nudge);
        clearTimeout(giveUp);
        setStatus(availability);
        return;
      }
      // The watch keeps running after giving up: a late first reading still brings the arrow.
      stop = headingService.watch((reading) => {
        const now = Date.now();
        smoothed = smoothHeading(smoothed, reading);
        if (!received) {
          received = true;
          setStatus('available');
        }
        if (now - lastStep < HEADING_STEP_MS) return;
        lastStep = now;
        latest.current(smoothed);
      });
    });
    return () => {
      cancelled = true;
      clearTimeout(nudge);
      clearTimeout(giveUp);
      stop?.();
    };
  }, [attempt]);

  async function requestPermission() {
    const result = await headingService.requestPermission();
    setStatus(result === 'available' ? 'waiting' : result);
    if (result === 'available') setAttempt((value) => value + 1);
  }

  return { status, requestPermission };
}

type Props = {
  /** Degrees from true north to the other person, in 15-degree steps; null under 100 m. */
  bearing: number | null;
  nearby: boolean;
  located: boolean;
};

/**
 * Instant Meet's signature (spec 31): an arrow that points toward the other person, turned by
 * the device heading. Readings are smoothed and the arrow follows on a fully damped spring, so
 * compass and GPS jitter never make it shake. Under 100 m there is no arrow, only "nearby".
 */
export function Compass({ bearing, nearby, located }: Props) {
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  // Numeric sizes: a percentage width with a max width and an aspect ratio draws an oval on
  // Android.
  const dial = Math.min(width - layout.screenGutter * 2, sizes.compassMax);
  const glow = Math.round(dial * 0.7);
  const rotation = useSharedValue(0);
  const angle = useRef(0);
  const heading = useRef<number | null>(null);
  const target = useRef(bearing);

  function point() {
    if (target.current === null || heading.current === null) return;
    angle.current = shortestRotation(
      angle.current,
      relativeBearing(target.current, heading.current),
    );
    rotation.set(withSpring(angle.current, springs.compass));
  }

  const device = useDeviceHeading((degrees) => {
    heading.current = degrees;
    point();
  });

  useEffect(() => {
    target.current = bearing;
    point();
    // `point` only reads refs and the shared value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bearing]);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }));

  const showArrow = located && !nearby && bearing !== null && device.status === 'available';

  let caption: string;
  if (!located) caption = 'Finding where you both are…';
  else if (nearby) caption = 'Look around. They are close.';
  else if (device.status === 'available')
    caption = 'Hold your phone flat. The arrow points to them.';
  else if (device.status === 'waiting') caption = 'Reading your compass…';
  else if (device.status === 'idle') caption = 'Turn your phone a little to start the compass.';
  else if (device.status === 'needs-permission')
    caption = 'Allow the compass to see their direction.';
  else caption = 'Direction unavailable on this device';

  return (
    <View style={styles.root}>
      <View style={[styles.dial, { width: dial, height: dial }]} accessible={false}>
        <View style={styles.forward} />
        {showArrow ? (
          <Animated.View style={arrowStyle}>
            <SoulIcon name="navigation" size="compass" weight="regular" />
          </Animated.View>
        ) : nearby && located ? (
          <View style={[styles.nearbyWrap, { width: glow, height: glow }]}>
            <Animated.View
              style={[
                styles.pulse,
                reducedMotion
                  ? styles.pulseStill
                  : {
                      animationName: pulse,
                      animationDuration: '2000ms',
                      animationIterationCount: 'infinite',
                      animationTimingFunction: 'ease-out',
                    },
              ]}
            />
            <View style={styles.dot} />
          </View>
        ) : (
          <SoulIcon name={located ? 'explore_off' : 'location_on'} size="xl" color="textTertiary" />
        )}
      </View>
      <SoulText
        variant="supporting"
        tone="secondary"
        align="center"
        accessibilityLiveRegion="polite"
        style={styles.caption}>
        {caption}
      </SoulText>
      {device.status === 'needs-permission' ? (
        <SoulButton
          label="Turn on compass"
          variant="secondary"
          size="md"
          onPress={() => void device.requestPermission()}
        />
      ) : null}
    </View>
  );
}

const pulse = {
  from: { transform: [{ scale: 0.4 }], opacity: 0.5 },
  to: { transform: [{ scale: 1 }], opacity: 0 },
};

const DOT = spacing.lg;

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    root: { alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
    dial: {
      borderRadius: radii.full,
      borderWidth: borders.thin,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Marks the top of the phone: "ahead" is where the arrow is measured from.
    forward: {
      position: 'absolute',
      top: -spacing.xs,
      width: borders.strong * 2,
      height: spacing.md,
      borderRadius: radii.full,
      backgroundColor: colors.textPrimary,
    },
    nearbyWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    pulse: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      borderRadius: radii.full,
      backgroundColor: colors.textPrimary,
    },
    pulseStill: { opacity: 0.08 },
    dot: {
      width: DOT,
      height: DOT,
      borderRadius: radii.full,
      backgroundColor: colors.textPrimary,
    },
    // Full width: shrink-wrapped centred text can lose its last word on Android.
    caption: { alignSelf: 'stretch' },
  }),
);
