import { z } from 'zod';

/** The report categories of spec 42, in the order people look for them. */
export const REPORT_CATEGORIES = [
  'harassment',
  'threat',
  'stalking',
  'explicit_content',
  'fake_account',
  'impersonation',
  'underage',
  'spam',
  'other',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_LABEL: Record<ReportCategory, string> = {
  harassment: 'Harassment',
  threat: 'Threats',
  stalking: 'Stalking',
  explicit_content: 'Explicit content',
  fake_account: 'Fake account',
  impersonation: 'Pretending to be someone else',
  underage: 'Under 18',
  spam: 'Spam or scams',
  other: 'Something else',
};

export type SafetyContext = 'chat' | 'profile' | 'instant' | 'discovery';

export const MAX_REPORT_DETAILS = 1000;

export const blocksSchema = z.object({
  ok: z.literal(true),
  blocks: z.array(
    z.object({ id: z.string().uuid(), name: z.string().nullable(), blocked_at: z.string() }),
  ),
});
export type BlockedPerson = z.infer<typeof blocksSchema>['blocks'][number];

export const resultSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
  blocked: z.boolean().optional(),
});

/** What the restricted screen says (spec 67: suspension). Never internal details. */
export function restrictionCopy(
  state: 'suspended' | 'banned' | 'deletion_pending',
  until: string | null,
  formatDay: (iso: string) => string,
): { title: string; body: string } {
  if (state === 'banned') {
    return {
      title: 'Your account has been closed',
      body: "It broke SOUL's community rules. If you think this is a mistake, write to SOUL support from your SRMIST email.",
    };
  }
  if (state === 'deletion_pending') {
    return {
      title: 'Your account is being deleted',
      body: 'This takes a moment. You can close SOUL.',
    };
  }
  return {
    title: 'Your account is paused',
    body: until
      ? `It is hidden from everyone until ${formatDay(until)} for breaking SOUL's community rules. If you think this is a mistake, write to SOUL support from your SRMIST email.`
      : 'It is hidden from everyone while SOUL looks into a report. If you think this is a mistake, write to SOUL support from your SRMIST email.',
  };
}
