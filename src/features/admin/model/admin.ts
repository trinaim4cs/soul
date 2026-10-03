import { z } from 'zod';

import { REPORT_CATEGORIES } from '@/features/safety/model/safety';

/**
 * Admin and moderation (spec 45, DECISIONS D-055). The server decides every permission; these
 * schemas only read what it returns.
 */
export type AdminRole = 'moderator' | 'admin';

export const roleSchema = z.object({
  ok: z.literal(true),
  role: z.enum(['moderator', 'admin']).nullable(),
});

const uuid = z.string().uuid();

export const queueSchema = z.object({
  ok: z.literal(true),
  reports: z.array(
    z.object({
      id: uuid,
      category: z.enum(REPORT_CATEGORIES),
      context: z.string(),
      details: z.string().nullable(),
      priority: z.boolean(),
      created_at: z.string(),
      reported_id: uuid.nullable(),
      reported_deleted: z.boolean(),
      reports_against: z.number(),
      evidence: z.object({
        messages: z
          .array(
            z.object({ from: z.enum(['reporter', 'reported']), body: z.string(), at: z.string() }),
          )
          .optional(),
      }),
    }),
  ),
  photos: z.array(
    z.object({
      id: uuid,
      user_id: uuid,
      path: z.string(),
      position: z.number(),
      created_at: z.string(),
    }),
  ),
  appeals: z.array(
    z.object({
      id: uuid,
      user_id: uuid.nullable(),
      account_state: z.string(),
      restriction_reason: z.string().nullable(),
      message: z.string(),
      created_at: z.string(),
    }),
  ),
  date_flags: z.array(
    z.object({
      id: z.number(),
      date_round_id: uuid,
      user_id: uuid.nullable(),
      reason: z.string(),
      created_at: z.string(),
      user_a: uuid,
      user_b: uuid,
      status: z.string(),
      invalidated: z.boolean(),
    }),
  ),
});
export type ModerationQueue = z.infer<typeof queueSchema>;
export type QueuedReport = ModerationQueue['reports'][number];

export const accountSchema = z.object({
  ok: z.literal(true),
  id: uuid,
  email: z.string().nullable(),
  role: z.enum(['moderator', 'admin']).nullable(),
  created_at: z.string(),
  account_state: z.enum(['active', 'suspended', 'banned', 'deletion_pending']),
  restricted_until: z.string().nullable(),
  restriction_reason: z.string().nullable(),
  email_verified_at: z.string().nullable(),
  terms_version: z.string().nullable(),
  age: z.number().nullable(),
  age_check_failed_at: z.string().nullable(),
  profile_completed_at: z.string().nullable(),
  profile: z
    .object({
      name: z.string().nullable(),
      hook: z.string().nullable(),
      gender: z.string().nullable(),
      privacy_mode: z.string(),
    })
    .nullable(),
  photos: z.array(
    z.object({ id: uuid, path: z.string(), status: z.string(), position: z.number() }),
  ),
  reports_against: z.number(),
  open_reports_against: z.number(),
  reports_made: z.number(),
  history: z.array(
    z.object({ action: z.string(), reason: z.string().nullable(), created_at: z.string() }),
  ),
  appeals: z.array(z.object({ status: z.string(), message: z.string(), created_at: z.string() })),
  likes_left: z.number(),
  plans: z.array(z.object({ plan_id: z.string(), ends_at: z.string(), status: z.string() })),
  payments: z.number(),
  hot_person: z.boolean(),
  counted_dates: z.number(),
  open_date_flags: z.number(),
  devices: z.number(),
});
export type AdminAccount = z.infer<typeof accountSchema>;

export const plansSchema = z.object({
  ok: z.literal(true),
  plans: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['subscription', 'topup']),
      title: z.string(),
      price_paise: z.number(),
      right_swipes: z.number(),
      period_label: z.string().nullable(),
      includes_instant: z.boolean(),
      active: z.boolean(),
    }),
  ),
});
export type AdminPlan = z.infer<typeof plansSchema>['plans'][number];

export const flagsSchema = z.object({
  ok: z.literal(true),
  flags: z.array(
    z.object({
      key: z.string(),
      kind: z.enum(['boolean', 'integer']),
      min: z.number().nullable(),
      max: z.number().nullable(),
      label: z.string(),
      value: z.unknown(),
    }),
  ),
});
export type AdminFlag = z.infer<typeof flagsSchema>['flags'][number];

export const resultSchema = z.object({ ok: z.boolean(), reason: z.string().optional() });

export const appealSchema = z.object({
  ok: z.literal(true),
  appeal: z
    .object({
      status: z.enum(['open', 'restored', 'upheld']),
      created_at: z.string(),
      decided_at: z.string().nullable(),
    })
    .nullable(),
});
export type MyAppeal = z.infer<typeof appealSchema>['appeal'];

export const MAX_APPEAL = 1000;

/** Suspension lengths offered to moderators; a ban has no end. */
export const SUSPENSIONS = [
  { label: 'Suspend 1 day', days: 1 },
  { label: 'Suspend 7 days', days: 7 },
  { label: 'Suspend 30 days', days: 30 },
] as const;

export function suspendUntil(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export const ACTION_LABEL: Record<string, string> = {
  suspend: 'Suspended',
  ban: 'Banned',
  restore: 'Restored',
  approve_photo: 'Photo approved',
  reject_photo: 'Photo rejected',
  resolve_report: 'Report acted on',
  dismiss_report: 'Report dismissed',
  appeal_restored: 'Appeal: restored',
  appeal_upheld: 'Appeal: kept',
  invalidate_date: 'Date voided',
  clear_date_flag: 'Date flag cleared',
  grant_likes: 'Likes given',
  grant_plan: 'Plan granted',
};

/** The reasons moderators record (D-053), in words. */
export const REASON_LABEL: Record<string, string> = {
  community_rules: 'Community rules',
  fake_account: 'Fake account',
  underage: 'Under 18',
  safety: 'Safety',
  other: 'Other',
};

export const STATE_LABEL: Record<AdminAccount['account_state'], string> = {
  active: 'Active',
  suspended: 'Suspended',
  banned: 'Banned',
  deletion_pending: 'Being deleted',
};

/** Rupees as typed by an admin ("199" or "199.50"), to paise; null when not a valid price. */
export function rupeesToPaise(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(trimmed)) return null;
  const paise = Math.round(Number(trimmed) * 100);
  return paise >= 100 && paise <= 1_000_000 ? paise : null;
}

export function paiseToRupees(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

/** What the restricted screen says about an appeal. */
export function appealCopy(appeal: MyAppeal): string | null {
  if (!appeal) return null;
  if (appeal.status === 'open') return 'Your request is with SOUL. You will see the answer here.';
  if (appeal.status === 'upheld') return 'SOUL looked at your request and kept this decision.';
  return null;
}
