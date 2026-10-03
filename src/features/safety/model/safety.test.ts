import {
  REPORT_CATEGORIES,
  REPORT_LABEL,
  blocksSchema,
  restrictionCopy,
} from '@/features/safety/model/safety';

const day = (iso: string) => iso.slice(0, 10);

describe('report categories', () => {
  it('covers the nine categories of the spec, each with a label', () => {
    expect(REPORT_CATEGORIES).toHaveLength(9);
    for (const category of REPORT_CATEGORIES) expect(REPORT_LABEL[category]).toBeTruthy();
    expect(new Set(REPORT_CATEGORIES)).toEqual(
      new Set([
        'harassment',
        'fake_account',
        'impersonation',
        'threat',
        'stalking',
        'explicit_content',
        'spam',
        'underage',
        'other',
      ]),
    );
  });
});

describe('restricted screen', () => {
  it('says until when for a timed suspension', () => {
    expect(restrictionCopy('suspended', '2026-10-10T00:00:00Z', day).body).toMatch(
      /until 2026-10-10/,
    );
  });

  it('never shows internal details, only the plain situation', () => {
    for (const state of ['suspended', 'banned', 'deletion_pending'] as const) {
      const copy = restrictionCopy(state, null, day);
      expect(copy.title).toBeTruthy();
      expect(copy.body).not.toMatch(/report(ed)? by|reporter|moderator/i);
    }
  });
});

describe('blocked list', () => {
  it('reads the server payload; anonymous people have no name', () => {
    const parsed = blocksSchema.parse({
      ok: true,
      blocks: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: null,
          blocked_at: '2026-10-03T10:00:00Z',
        },
      ],
    });
    expect(parsed.blocks[0]!.name).toBeNull();
  });
});
