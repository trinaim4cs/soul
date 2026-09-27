import { responsiveFontSize, typeScale } from './typography';

describe('type scale', () => {
  it('orders heading sizes by hierarchy (no single heading size)', () => {
    const headings = [typeScale.display, typeScale.title, typeScale.section, typeScale.subheading];
    const sizes = headings.map((v) => v.fontSize ?? 0);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it('keeps body text comfortable and unbounded for font scaling', () => {
    expect(typeScale.body.fontSize).toBeGreaterThanOrEqual(16);
    expect('maxFontSizeMultiplier' in typeScale.body).toBe(false);
  });

  it('tightens display roles on compact screens only', () => {
    expect(responsiveFontSize(typeScale.title, 320).fontSize).toBeLessThan(
      typeScale.title.fontSize ?? 0,
    );
    expect(responsiveFontSize(typeScale.title, 411).fontSize).toBe(typeScale.title.fontSize);
    expect(responsiveFontSize(typeScale.body, 320).fontSize).toBe(typeScale.body.fontSize);
  });
});
