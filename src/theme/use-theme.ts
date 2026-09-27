import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type ColorTokens } from './colors';

export type ColorScheme = 'light' | 'dark';

export type Theme = {
  scheme: ColorScheme;
  colors: ColorTokens;
};

const lightTheme: Theme = { scheme: 'light', colors: lightColors };
const darkTheme: Theme = { scheme: 'dark', colors: darkColors };

/** Current appearance (follows the Android system setting, DECISIONS D-025). */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}

/**
 * Builds styles once per appearance and reuses them, so components never rebuild
 * StyleSheets on every render.
 */
export function createThemedStyles<T>(factory: (theme: Theme) => T): () => T {
  const cache = new Map<ColorScheme, T>();
  return function useThemedStyles() {
    const theme = useTheme();
    let styles = cache.get(theme.scheme);
    if (!styles) {
      styles = factory(theme);
      cache.set(theme.scheme, styles);
    }
    return styles;
  };
}
