import { darkColors, lightColors, type ColorTokens } from './colors';

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

type Pair = [keyof ColorTokens, keyof ColorTokens, number];

// WCAG 2.2 AA: 4.5:1 for text, 3:1 for icons and large text.
const PAIRS: Pair[] = [
  ['textPrimary', 'background', 4.5],
  ['textSecondary', 'background', 4.5],
  ['textTertiary', 'background', 4.5],
  ['textPrimary', 'surfaceSubtle', 4.5],
  ['textSecondary', 'surfaceSubtle', 4.5],
  ['inverseText', 'inverseSurface', 4.5],
  ['onAccent', 'accent', 4.5],
  ['accent', 'background', 3],
  ['onMoment', 'moment', 4.5],
  ['onMomentSecondary', 'moment', 4.5],
  ['accentOnMoment', 'moment', 4.5],
  ['borderStrong', 'background', 3],
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s appearance contrast', (_name, colors) => {
  it.each(PAIRS)('%s on %s meets %d:1', (fg, bg, minimum) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(minimum);
  });
});
