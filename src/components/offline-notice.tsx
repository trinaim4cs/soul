import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SoulIcon } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { createThemedStyles, radii, spacing } from '@/theme';

/** Below a standard screen header (56 dp) with a little air. */
const HEADER_CLEARANCE = 64;

const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

/**
 * A quiet note at the top while the device is offline (spec 76, Phase 19). Reads pause and
 * pick up again by themselves when the connection returns, so the screens keep what they
 * already show instead of each turning into an error. It never blocks a touch, and it sits
 * just below a screen header so it never covers the back button or a title's controls.
 */
export function OfflineNotice() {
  const online = useSyncExternalStore(subscribe, isOnline, isOnline);
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  if (online) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + HEADER_CLEARANCE }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel="You're offline. SOUL will catch up when you're back.">
      <View style={styles.pill}>
        <SoulIcon name="wifi_off" size="sm" color="inverseText" />
        <SoulText variant="caption" tone="inverse">
          {"You're offline"}
        </SoulText>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.full,
      backgroundColor: colors.inverseSurface,
      maxWidth: '92%',
    },
  }),
);
