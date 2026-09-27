import { cardSchema, cardTitle, feedSchema, toProfileView, type DiscoveryCard } from './card';

const card: DiscoveryCard = {
  id: '0000000f-0000-4000-8000-00000000000a',
  name: 'Profile 01',
  anonymous: false,
  gender: 'non_binary',
  age: 23,
  verified: true,
  hook: 'Late chai, early runs',
  about: null,
  zodiac: 'leo',
  hot_person: false,
  photos: [
    { bucket: 'profile-photos', path: 'a/1.jpg' },
    { bucket: 'profile-photos', path: 'a/2.jpg' },
  ],
};

describe('discovery card', () => {
  it('parses the server card and the feed envelope', () => {
    expect(cardSchema.parse(card)).toEqual(card);
    expect(feedSchema.parse({ ok: true, cards: [card] })).toEqual({ ok: true, cards: [card] });
    expect(feedSchema.parse({ ok: false, reason: 'not_eligible' })).toEqual({
      ok: false,
      reason: 'not_eligible',
    });
  });

  it('refuses cards without a photo or with unexpected buckets', () => {
    expect(() => cardSchema.parse({ ...card, photos: [] })).toThrow();
    expect(() =>
      cardSchema.parse({ ...card, photos: [{ bucket: 'report-evidence', path: 'x' }] }),
    ).toThrow();
  });

  it('never shows a name on anonymous cards', () => {
    const anonymous = { ...card, anonymous: true, name: null };
    expect(cardTitle(anonymous)).toBe('Anonymous, 23');
    expect(toProfileView(anonymous, {}).name).toBeNull();
    expect(cardTitle(card)).toBe('Profile 01, 23');
  });

  it('maps to the profile viewer, keeping photo order and skipping missing URLs', () => {
    const view = toProfileView(card, {
      'a/2.jpg': 'https://signed/2',
      'a/1.jpg': 'https://signed/1',
    });
    expect(view.photos).toEqual(['https://signed/1', 'https://signed/2']);
    expect(view.zodiac).toBe('Leo');
    expect(view.gender).toBe('Non-binary');
    expect(toProfileView(card, { 'a/2.jpg': 'https://signed/2' }).photos).toEqual([
      'https://signed/2',
    ]);
  });
});
