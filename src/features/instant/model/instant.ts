import { z } from 'zod';

import { cardSchema } from '@/features/discovery/model/card';
import type { LocationFix } from '@/services/location';

/** How long a person can make themselves available (spec 30). */
export const INSTANT_DURATIONS = [15, 30, 60] as const;
export type InstantDuration = (typeof INSTANT_DURATIONS)[number];

/**
 * A live session as `instant_state` returns it (DECISIONS D-050). Only derived values: a
 * rounded distance, a 15-degree bearing, or `nearby` under 100 m. Never a coordinate.
 */
export const sessionSchema = z.object({
  id: z.string().uuid(),
  person: cardSchema,
  started_at: z.string(),
  expires_at: z.string(),
  conversation_id: z.string().uuid().nullable(),
  located: z.boolean(),
  nearby: z.boolean(),
  distance_m: z.number().int().nullable(),
  bearing: z.number().int().min(0).max(359).nullable(),
});
export type InstantSession = z.infer<typeof sessionSchema>;

export const stateSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    /** The caller's plan includes Instant Meet. */
    entitled: z.boolean(),
    /** Instant is on for the caller. */
    active: z.boolean(),
    active_until: z.string().nullable(),
    /** The server has a usable position for the caller (never the position itself). */
    located: z.boolean(),
    session: sessionSchema.nullable(),
  }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type InstantState = Extract<z.infer<typeof stateSchema>, { ok: true }>;

export const candidateSchema = cardSchema.extend({
  /** The caller has accepted this person and is waiting for them. */
  accepted: z.boolean(),
});
export type InstantCandidate = z.infer<typeof candidateSchema>;

export const candidatesSchema = z.object({
  ok: z.literal(true),
  candidates: z.array(candidateSchema),
});

export const resultSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
  session: z.string().uuid().nullable().optional(),
  ended: z.boolean().optional(),
});

/** What the distance line says: "~650 m", "~1.2 km", "You're nearby", or nothing yet. */
export function distanceLabel(session: Pick<InstantSession, 'located' | 'nearby' | 'distance_m'>) {
  if (!session.located) return null;
  if (session.nearby || session.distance_m === null) return "You're nearby";
  if (session.distance_m < 1000) return `~${session.distance_m} m`;
  return `~${(session.distance_m / 1000).toFixed(1)} km`;
}

/** Spoken form for screen readers: "About 650 metres away". */
export function distanceSpoken(session: Pick<InstantSession, 'located' | 'nearby' | 'distance_m'>) {
  if (!session.located) return 'Distance not known yet';
  if (session.nearby || session.distance_m === null) return 'Less than 100 metres away';
  return session.distance_m < 1000
    ? `About ${session.distance_m} metres away`
    : `About ${(session.distance_m / 1000).toFixed(1)} kilometres away`;
}

/** "12:05" until the end, "0:00" once passed. */
export function timeLeftLabel(until: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** "12 minutes left", "1 minute left", "Less than a minute left". */
export function timeLeftSpoken(until: string, now: number = Date.now()): string {
  const minutes = Math.floor(Math.max(0, new Date(until).getTime() - now) / 60_000);
  if (minutes < 1) return 'Less than a minute left';
  return minutes === 1 ? '1 minute left' : `${minutes} minutes left`;
}

/** Normalises any angle to 0 (inclusive) to 360 (exclusive). */
export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Where to point on screen: the bearing to the other person, seen from the device heading. */
export function relativeBearing(bearing: number, heading: number): number {
  return normalizeDegrees(bearing - heading);
}

/**
 * The next rotation for an arrow already at `current` (any number of turns), taking the short
 * way round: from 350 to 10 it moves +20, never -340.
 */
export function shortestRotation(current: number, target: number): number {
  const delta = normalizeDegrees(target - current + 180) - 180;
  return current + delta;
}

/**
 * One step of a low-pass filter on a circular value, so compass jitter does not shake the
 * arrow (spec 31). `factor` is how much of the new reading to take (0 to 1).
 */
export function smoothHeading(previous: number | null, reading: number, factor = 0.2): number {
  if (previous === null) return normalizeDegrees(reading);
  const delta = normalizeDegrees(reading - previous + 180) - 180;
  return normalizeDegrees(previous + delta * factor);
}

/** Positions older than this are never sent: they describe where the person was. */
const MAX_FIX_AGE_MS = 60_000;
/** The server accepts one position every few seconds; sending more often only gets refused. */
export const POST_INTERVAL_MS = 5_000;

/** Whether a fresh device position should go to the server now. */
export function shouldSendFix(fix: LocationFix, lastSentAt: number | null, now: number): boolean {
  if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) return false;
  if (!Number.isFinite(fix.accuracy) || fix.accuracy > 100_000) return false;
  if (now - fix.timestamp > MAX_FIX_AGE_MS) return false;
  return lastSentAt === null || now - lastSentAt >= POST_INTERVAL_MS;
}
