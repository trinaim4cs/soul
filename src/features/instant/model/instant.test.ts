import {
  distanceLabel,
  distanceSpoken,
  normalizeDegrees,
  relativeBearing,
  sessionSchema,
  shortestRotation,
  shouldSendFix,
  smoothHeading,
  stateSchema,
  timeLeftLabel,
  timeLeftSpoken,
} from '@/features/instant/model/instant';

const located = { located: true, nearby: false };

describe('distance', () => {
  it('shows only the rounded bucket the server sent', () => {
    expect(distanceLabel({ ...located, distance_m: 650 })).toBe('~650 m');
    expect(distanceLabel({ ...located, distance_m: 1200 })).toBe('~1.2 km');
    expect(distanceSpoken({ ...located, distance_m: 450 })).toBe('About 450 metres away');
  });

  it('says only "nearby" under 100 m', () => {
    const near = { located: true, nearby: true, distance_m: null };
    expect(distanceLabel(near)).toBe("You're nearby");
    expect(distanceSpoken(near)).toBe('Less than 100 metres away');
  });

  it('says nothing while a position is missing', () => {
    expect(distanceLabel({ located: false, nearby: false, distance_m: null })).toBeNull();
  });
});

describe('time left', () => {
  const now = Date.parse('2026-10-03T10:00:00Z');
  it('counts down in minutes and seconds, never below zero', () => {
    expect(timeLeftLabel('2026-10-03T10:12:05Z', now)).toBe('12:05');
    expect(timeLeftLabel('2026-10-03T09:59:00Z', now)).toBe('0:00');
  });
  it('speaks whole minutes', () => {
    expect(timeLeftSpoken('2026-10-03T10:12:05Z', now)).toBe('12 minutes left');
    expect(timeLeftSpoken('2026-10-03T10:01:30Z', now)).toBe('1 minute left');
    expect(timeLeftSpoken('2026-10-03T10:00:40Z', now)).toBe('Less than a minute left');
  });
});

describe('compass angles', () => {
  it('normalises any angle to 0 to 360', () => {
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(720)).toBe(0);
  });

  it('points relative to where the phone faces', () => {
    // They are due east; the phone faces east: straight ahead.
    expect(relativeBearing(90, 90)).toBe(0);
    // They are north; the phone faces east: to the left.
    expect(relativeBearing(0, 90)).toBe(270);
  });

  it('turns the short way round, across north', () => {
    expect(shortestRotation(350, 10)).toBe(370);
    expect(shortestRotation(10, 350)).toBe(-10);
    expect(shortestRotation(720 + 90, 80)).toBe(800);
  });

  it('smooths jittery readings across north without jumping', () => {
    expect(smoothHeading(null, 15)).toBe(15);
    // From 350 toward 10 the filter moves through north, not back through 180.
    expect(smoothHeading(350, 10, 0.5)).toBe(0);
    expect(smoothHeading(0, 90, 0.2)).toBeCloseTo(18);
  });
});

describe('sending positions', () => {
  const now = 1_000_000;
  const fix = { latitude: 12.82, longitude: 80.04, accuracy: 10, timestamp: now - 1000 };

  it('sends a fresh fix at most every few seconds', () => {
    expect(shouldSendFix(fix, null, now)).toBe(true);
    expect(shouldSendFix(fix, now - 1000, now)).toBe(false);
    expect(shouldSendFix(fix, now - 5000, now)).toBe(true);
  });

  it('never sends an old or broken fix', () => {
    expect(shouldSendFix({ ...fix, timestamp: now - 120_000 }, null, now)).toBe(false);
    expect(shouldSendFix({ ...fix, accuracy: Number.POSITIVE_INFINITY }, null, now)).toBe(false);
    expect(shouldSendFix({ ...fix, latitude: Number.NaN }, null, now)).toBe(false);
  });
});

describe('server payloads', () => {
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
    hot_person: false,
    photos: [{ bucket: 'profile-photos', path: 'a/b.jpg' }],
  };
  const session = {
    id: '00000000-0000-4000-8000-0000000000aa',
    person,
    started_at: '2026-10-03T10:00:00Z',
    expires_at: '2026-10-03T10:30:00Z',
    conversation_id: '00000000-0000-4000-8000-0000000000bb',
    located: true,
    nearby: false,
    distance_m: 650,
    bearing: 90,
  };

  it('reads a live session', () => {
    expect(sessionSchema.parse(session).distance_m).toBe(650);
  });

  it('drops anything that is not in the contract, such as a coordinate', () => {
    const parsed = sessionSchema.parse({ ...session, latitude: 12.8, longitude: 80.0 });
    expect(parsed).not.toHaveProperty('latitude');
    expect(parsed).not.toHaveProperty('longitude');
  });

  it('reads the state with and without a session', () => {
    const base = { ok: true, entitled: true, active: true, active_until: null, located: false };
    expect(stateSchema.parse({ ...base, session: null }).ok).toBe(true);
    expect(stateSchema.parse({ ...base, session }).ok).toBe(true);
    expect(stateSchema.parse({ ok: false, reason: 'not_eligible' }).ok).toBe(false);
  });
});
