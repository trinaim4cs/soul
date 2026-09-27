import { StyleSheet, Text } from 'react-native';

import {
  iconFontFamily,
  iconGlyph,
  iconSizes,
  useTheme,
  type ColorTokens,
  type IconName,
  type IconSize,
} from '@/theme';

export type { IconName } from '@/theme';

type Props = {
  /** Material Symbols name from `src/theme/icons.ts`: the single icon family. */
  name: IconName;
  size?: IconSize;
  color?: keyof ColorTokens;
  /** Light by default for SOUL's quiet chrome; regular for small sizes that need weight. */
  weight?: 'light' | 'regular';
  /** Icons are decorative unless given a label (icon-only buttons label the button instead). */
  accessibilityLabel?: string;
};

/**
 * Renders a glyph from the embedded SoulIcons font (a Material Symbols subset). The font is
 * built into the Android app and registered on the web before first render, so icons never
 * pop in (DESIGN_SYSTEM.md, Icons).
 */
export function SoulIcon({
  name,
  size = 'md',
  color = 'textPrimary',
  weight = 'light',
  accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const px = iconSizes[size];
  return (
    <Text
      style={[
        styles.glyph,
        {
          width: px,
          height: px,
          fontSize: px,
          lineHeight: px,
          fontWeight: weight === 'light' ? '300' : '400',
          color: colors[color],
        },
      ]}
      allowFontScaling={false}
      selectable={false}
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      role={accessibilityLabel ? 'img' : undefined}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      aria-hidden={accessibilityLabel ? undefined : true}>
      {iconGlyph(name)}
    </Text>
  );
}

const styles = StyleSheet.create({
  glyph: {
    fontFamily: iconFontFamily,
    fontStyle: 'normal',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
    overflow: 'hidden',
  },
});
