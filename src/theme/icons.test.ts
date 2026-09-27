import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import fontManifest from '../../assets/fonts/SoulIcons.codepoints.json';
import { iconGlyph, iconGlyphs } from './icons';

describe('icon font', () => {
  it('uses the official Material Symbols code point for every icon', () => {
    // The name-to-code-point table shipped with expo-symbols (not exported, so read from disk).
    const official = JSON.parse(
      readFileSync(
        join(__dirname, '../../node_modules/expo-symbols/build/android/symbols.json'),
        'utf8',
      ),
    ) as Record<string, number>;
    for (const [name, code] of Object.entries(iconGlyphs)) {
      expect({ name, code }).toEqual({ name, code: official[name] });
    }
  });

  it('matches the subset font on disk (run `npm run icons:subset` after editing icons.ts)', () => {
    expect(fontManifest).toEqual(iconGlyphs);
  });

  it('renders a single private-use glyph', () => {
    const glyph = iconGlyph('check');
    expect([...glyph]).toHaveLength(1);
    expect(glyph.codePointAt(0)).toBe(0xe5ca);
  });
});
