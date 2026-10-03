import {
  dateStateSchema,
  lastNote,
  myDatesSchema,
  progressDetail,
  progressLabel,
  type DateState,
  type MyDates,
} from '@/features/dates/model/dates';

const person = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Profile 01',
  anonymous: false,
  gender: 'woman',
  age: 22,
  verified: true,
  hook: null,
  about: null,
  zodiac: null,
  hot_person: true,
  photos: [{ bucket: 'profile-photos', path: 'a/b.jpg' }],
};

const base = {
  ok: true,
  person,
  source: 'match',
  state: 'ask',
  closes_at: null,
  next_at: null,
  last: null,
} as const;

const mine: MyDates = {
  ok: true,
  active: false,
  count: 2,
  threshold: 3,
  window_days: 30,
  distinct_partners: true,
  next_change: '2026-11-01T10:00:00Z',
};

describe('date state', () => {
  it('reads every state the server sends', () => {
    expect(dateStateSchema.parse(base).ok).toBe(true);
    expect(
      dateStateSchema.parse({ ...base, state: 'waiting', closes_at: '2026-10-10T10:00:00Z' }).ok,
    ).toBe(true);
    expect(dateStateSchema.parse({ ok: false, reason: 'not_available' }).ok).toBe(false);
  });

  it('notes how a last yes ended, only while asking again', () => {
    const notCounted = {
      ...base,
      last: { outcome: 'not_counted', at: '2026-10-03T10:00:00Z' },
    } as DateState;
    expect(lastNote(notCounted)).toMatch(/did not count/);
    expect(
      lastNote({ ...notCounted, last: { outcome: 'expired', at: notCounted.last!.at } }),
    ).toMatch(/ran out/);
    expect(lastNote({ ...notCounted, state: 'waiting' })).toBeNull();
    expect(lastNote(base as DateState)).toBeNull();
  });
});

describe('private progress', () => {
  it('counts toward the threshold, then shows the real count', () => {
    expect(progressLabel(mine)).toBe('2 of 3 dates in the last 30 days');
    expect(progressLabel({ ...mine, count: 4 })).toBe('4 dates in the last 30 days');
  });

  it('never names the badge in words', () => {
    for (const dates of [mine, { ...mine, active: true, count: 3 }]) {
      expect(progressDetail(dates)).not.toMatch(/hot person/i);
      expect(progressDetail(dates)).toMatch(/Only you see this count/);
    }
  });

  it('follows the server rule on distinct people', () => {
    expect(progressDetail(mine)).toMatch(/with different people/);
    expect(progressDetail({ ...mine, distinct_partners: false })).not.toMatch(/different people/);
  });

  it('reads the server payload', () => {
    expect(myDatesSchema.parse(mine).ok).toBe(true);
    expect(myDatesSchema.parse({ ...mine, next_change: null }).ok).toBe(true);
  });
});
