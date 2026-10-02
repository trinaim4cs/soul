import type { DiscoveryCard } from '@/features/discovery/model/card';

import { matchedLabel, matchesSchema, personName, unseenCount, type Match } from './match';

const person = (over: Partial<DiscoveryCard> = {}): DiscoveryCard => ({
  id: '0000000f-0000-4000-8000-000000000001',
  name: 'Profile 01',
  anonymous: false,
  gender: 'woman',
  age: 22,
  verified: true,
  hook: null,
  about: null,
  zodiac: null,
  hot_person: false,
  photos: [{ bucket: 'profile-photos', path: 'a/1.jpg' }],
  ...over,
});

const match = (over: Partial<Match> = {}): Match => ({
  id: '0000000a-0000-4000-8000-000000000001',
  created_at: new Date(2026, 9, 2, 10).toISOString(),
  seen: false,
  person: person(),
  ...over,
});

describe('matches', () => {
  it('counts the matches not seen yet', () => {
    expect(unseenCount(undefined)).toBe(0);
    expect(unseenCount([match(), match({ seen: true }), match()])).toBe(2);
  });

  it('names the person, or stays neutral when they remain anonymous', () => {
    expect(personName(person())).toBe('Profile 01');
    expect(personName(person({ anonymous: true, name: null }))).toBe('Anonymous');
  });

  it('says when the match happened, by calendar day', () => {
    const created = new Date(2026, 9, 2, 23, 30).toISOString();
    expect(matchedLabel(created, new Date(2026, 9, 2, 23, 45))).toBe('Matched today');
    expect(matchedLabel(created, new Date(2026, 9, 3, 0, 5))).toBe('Matched yesterday');
    expect(matchedLabel(created, new Date(2026, 9, 6, 9))).toBe('Matched 4 days ago');
    expect(matchedLabel(created, new Date(2026, 9, 20, 9))).toBe('Matched 2 Oct');
  });

  it('accepts the server list and the not-eligible answer', () => {
    const parsed = matchesSchema.parse({ ok: true, matches: [match()] });
    expect(parsed.ok && parsed.matches).toHaveLength(1);
    expect(matchesSchema.parse({ ok: false, reason: 'not_eligible' }).ok).toBe(false);
  });

  it('refuses a match whose person has no photo', () => {
    expect(
      matchesSchema.safeParse({ ok: true, matches: [match({ person: person({ photos: [] }) })] })
        .success,
    ).toBe(false);
  });
});
