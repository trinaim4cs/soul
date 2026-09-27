import { Text, useWindowDimensions, type TextProps, type TextStyle } from 'react-native';

import {
  responsiveFontSize,
  tabularNumbers,
  typeScale,
  useTheme,
  type ColorTokens,
  type TypeVariant,
} from '@/theme';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'disabled' | 'inverse' | 'onPhoto';

const toneColor: Record<Tone, keyof ColorTokens> = {
  primary: 'textPrimary',
  secondary: 'textSecondary',
  tertiary: 'textTertiary',
  disabled: 'textDisabled',
  inverse: 'inverseText',
  onPhoto: 'onPhoto',
};

export type SoulTextProps = TextProps & {
  variant?: TypeVariant;
  tone?: Tone;
  /** Italic is available for the display role (Instrument Serif Italic) only. */
  italic?: boolean;
  /** Tabular figures for timers, distances, prices and balances. */
  numeric?: boolean;
  align?: TextStyle['textAlign'];
};

/**
 * The only way screens render text. Typography comes from role tokens; screens never set
 * font families or sizes directly. Font scaling follows Android settings, bounded per role
 * only where a role is chrome-like or already very large.
 */
export function SoulText({
  variant = 'body',
  tone = 'primary',
  italic = false,
  numeric = false,
  align,
  style,
  maxFontSizeMultiplier,
  ...rest
}: SoulTextProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const {
    maxFontSizeMultiplier: roleMax,
    responsive: _responsive,
    ...roleStyle
  } = typeScale[variant] as (typeof typeScale)[TypeVariant] & {
    maxFontSizeMultiplier?: number;
    responsive?: boolean;
  };

  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? roleMax}
      style={[
        roleStyle,
        responsiveFontSize(typeScale[variant], width),
        { color: colors[toneColor[tone]] },
        italic && variant !== 'body' ? { fontStyle: 'italic' } : null,
        numeric ? tabularNumbers : null,
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}
