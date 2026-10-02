import { Tabs } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SoulIcon } from '@/components/soul-icon';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { useMatches } from '@/features/matching/api/matches';
import { unseenCount } from '@/features/matching/model/match';
import { TAB_ITEMS } from '@/features/shell/tab-items';
import { fontFamily, typeScale, useTheme } from '@/theme';

/** Icon, label and breathing room (the default 49 px bar clips the label). */
const BAR_HEIGHT = 64;

/**
 * iPhone PWA tab bar: the same four tabs at the bottom, with SoulIcons, since NativeTabs
 * renders a text-only tab list in a browser (PLATFORM_MATRIX.md).
 */
export default function WebTabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const newMatches = unseenCount(useMatches(useCurrentUserId()).data);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarItemStyle: { justifyContent: 'center' },
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.divider,
          height: BAR_HEIGHT + insets.bottom,
          paddingTop: 0,
          paddingBottom: insets.bottom,
        },
        tabBarBadgeStyle: { backgroundColor: colors.inverseSurface, color: colors.inverseText },
        tabBarLabelStyle: {
          fontFamily: fontFamily.body,
          fontSize: typeScale.caption.fontSize,
          lineHeight: typeScale.caption.lineHeight,
          fontWeight: '500',
        },
      }}>
      {TAB_ITEMS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            tabBarBadge: tab.name === 'chats' && newMatches > 0 ? newMatches : undefined,
            tabBarIcon: ({ focused }) => (
              <SoulIcon
                name={tab.icon}
                color={focused ? 'textPrimary' : 'textTertiary'}
                weight={focused ? 'regular' : 'light'}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
