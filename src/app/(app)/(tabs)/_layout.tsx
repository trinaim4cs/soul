import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { useMatches } from '@/features/matching/api/matches';
import { unseenCount } from '@/features/matching/model/match';
import { TAB_ITEMS } from '@/features/shell/tab-items';
import { fontFamily, typeScale, useTheme } from '@/theme';

// Native Material bottom navigation (DECISIONS D-004: chrome stays native). Material Symbols
// is the single icon family (tabs via `md`, in-app via SoulIcon). The web build uses
// `_layout.web.tsx`, because NativeTabs renders a text-only tab list in a browser.
export default function TabsLayout() {
  const { colors } = useTheme();
  const label = { fontFamily: fontFamily.body, fontSize: typeScale.caption.fontSize };
  // New matches show as a count on Chats (monochrome, like the rest of the chrome).
  const newMatches = unseenCount(useMatches(useCurrentUserId()).data);
  return (
    <NativeTabs
      backgroundColor={colors.background}
      badgeBackgroundColor={colors.inverseSurface}
      badgeTextColor={colors.inverseText}
      indicatorColor={colors.surfaceSubtle}
      rippleColor={colors.surfaceSubtle}
      labelVisibilityMode="labeled"
      iconColor={{ default: colors.textTertiary, selected: colors.textPrimary }}
      labelStyle={{
        default: { ...label, fontWeight: '400', color: colors.textTertiary },
        selected: { ...label, fontWeight: '500', color: colors.textPrimary },
      }}>
      {TAB_ITEMS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon md={tab.icon} />
          {/* Rendered only when there is something to count: `hidden` still draws "0" on Android. */}
          {tab.name === 'chats' && newMatches > 0 ? (
            <NativeTabs.Trigger.Badge>{String(newMatches)}</NativeTabs.Trigger.Badge>
          ) : null}
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
