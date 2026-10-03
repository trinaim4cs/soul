import {
  accountSchema,
  appealCopy,
  paiseToRupees,
  queueSchema,
  rupeesToPaise,
  suspendUntil,
} from '@/features/admin/model/admin';

const id = '00000000-0000-4000-8000-000000000001';

describe('plan prices', () => {
  it('reads rupees as an admin types them', () => {
    expect(rupeesToPaise('199')).toBe(19900);
    expect(rupeesToPaise(' 49.5 ')).toBe(4950);
    expect(rupeesToPaise('0.99')).toBeNull();
    expect(rupeesToPaise('10001')).toBeNull();
    expect(rupeesToPaise('1e3')).toBeNull();
    expect(rupeesToPaise('-5')).toBeNull();
    expect(rupeesToPaise('')).toBeNull();
  });

  it('shows paise back as rupees', () => {
    expect(paiseToRupees(19900)).toBe('199');
    expect(paiseToRupees(4950)).toBe('49.50');
  });
});

describe('suspensions', () => {
  it('ends a whole number of days from now', () => {
    const now = new Date('2026-10-03T10:00:00Z');
    expect(suspendUntil(7, now)).toBe('2026-10-10T10:00:00.000Z');
  });
});

describe('appeals', () => {
  it('tells the person where their request stands, never who decided', () => {
    expect(appealCopy(null)).toBeNull();
    expect(
      appealCopy({ status: 'open', created_at: '2026-10-03T10:00:00Z', decided_at: null }),
    ).toMatch(/with SOUL/);
    expect(
      appealCopy({
        status: 'upheld',
        created_at: '2026-10-03T10:00:00Z',
        decided_at: '2026-10-04T10:00:00Z',
      }),
    ).toMatch(/kept this decision/);
  });
});

describe('server payloads', () => {
  it('reads the queue, evidence included', () => {
    const queue = queueSchema.parse({
      ok: true,
      reports: [
        {
          id,
          category: 'harassment',
          context: 'chat',
          details: null,
          priority: false,
          created_at: '2026-10-03T10:00:00Z',
          reported_id: id,
          reported_deleted: false,
          reports_against: 1,
          evidence: { messages: [{ from: 'reported', body: 'Hello', at: '2026-10-03T09:00:00Z' }] },
        },
      ],
      photos: [],
      appeals: [],
      date_flags: [],
    });
    expect(queue.reports[0]!.evidence.messages).toHaveLength(1);
  });

  it('never expects a birth date in the account view', () => {
    expect(Object.keys(accountSchema.shape)).not.toContain('date_of_birth');
  });
});
