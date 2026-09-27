import { Image } from 'expo-image';

import { useTheme } from '@/theme';

const LOGO_ASPECT = 750 / 311;
/** 734 px mark: stays crisp up to ~180 dp at xxxhdpi (DECISIONS D-022). */
const MAX_WIDTH = 180;

type Props = {
  width?: number;
  /** Force a variant for fixed-colour surfaces (e.g. the black welcome in light mode). */
  on?: 'light-surface' | 'dark-surface';
};

/**
 * The supplied SOUL mark, used as-is (never re-typeset). Used on splash-adjacent brand
 * moments, auth entry and major branded empty states only.
 */
export function SoulLogo({ width = 140, on }: Props) {
  const { scheme } = useTheme();
  const surface = on ?? (scheme === 'dark' ? 'dark-surface' : 'light-surface');
  const w = Math.min(width, MAX_WIDTH);
  return (
    <Image
      source={
        surface === 'dark-surface'
          ? require('@/assets/brand/derived/soul-logo-white.png')
          : require('@/assets/brand/derived/soul-logo-black.png')
      }
      style={{ width: w, height: w / LOGO_ASPECT }}
      contentFit="contain"
      accessibilityRole="image"
      accessibilityLabel="SOUL"
    />
  );
}
