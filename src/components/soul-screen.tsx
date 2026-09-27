import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createThemedStyles, layout, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  /** Scroll short, bounded content. Unbounded lists use FlashList inside a plain screen. */
  scroll?: boolean;
  /**
   * Screens with inputs: fields scroll into view and the footer rides above the keyboard,
   * both driven by react-native-keyboard-controller on the UI thread.
   */
  keyboard?: boolean;
  /** Pinned bottom area (primary actions), kept clear of the navigation bar and keyboard. */
  footer?: ReactNode;
  /** Remove the horizontal gutter for full-bleed content such as photos. */
  bleed?: boolean;
  /** Set when the screen sits under a native header or the tab bar owns the bottom inset. */
  edges?: { top?: boolean; bottom?: boolean };
  contentStyle?: StyleProp<ViewStyle>;
};

/** Screen container: background, safe areas, gutter, keyboard and generous vertical rhythm. */
export function SoulScreen({
  children,
  scroll = false,
  keyboard = false,
  footer,
  bleed = false,
  edges = { top: true, bottom: true },
  contentStyle,
}: Props) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const bottom = edges.bottom ? insets.bottom + spacing.lg : spacing.lg;
  const padding = [
    styles.content,
    !bleed && styles.gutter,
    { paddingTop: edges.top ? spacing.lg : 0, paddingBottom: footer ? spacing.lg : bottom },
    contentStyle,
  ];

  const body = keyboard ? (
    <KeyboardAwareScrollView
      contentContainerStyle={padding}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={spacing.xxxl * 2}>
      {children}
    </KeyboardAwareScrollView>
  ) : scroll ? (
    <ScrollView
      contentContainerStyle={padding}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padding]}>{children}</View>
  );

  const footerView = footer ? (
    <View style={[styles.footer, !bleed && styles.gutter, { paddingBottom: bottom }]}>
      {footer}
    </View>
  ) : null;

  // The top inset is applied to the container, not the scroll content, so scrolled content
  // never slides under the transparent edge-to-edge status bar.
  return (
    <View style={[styles.root, { paddingTop: edges.top ? insets.top : 0 }]}>
      {body}
      {footerView && keyboard ? (
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          {footerView}
        </KeyboardStickyView>
      ) : (
        footerView
      )}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    content: { gap: layout.stackGap },
    gutter: { paddingHorizontal: layout.screenGutter },
    footer: { gap: spacing.sm, paddingTop: spacing.sm, backgroundColor: colors.background },
  }),
);
