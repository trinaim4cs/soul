import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { TAB_ITEMS } from '@/features/shell/tab-items';
import { fontFamily, typeScale, useTheme } from '@/theme';

// Native Material bottom navigation (DECISIONS D-004: chrome stays native). Material Symbols
// is the single icon family (tabs via `md`, in-app via SoulIcon). The web build uses
// `_layout.web.tsx`, because NativeTabs renders a text-only tab list in a browser.
export default function TabsLayout() {
  const { colors } = useTheme();
  const label = { fontFamily: fontFamily.body, fontSize: typeScale.caption.fontSize };
  return (
    <NativeTabs
      backgroundColor={colors.background}
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
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
