/**
 * Client-side email checks are for fast feedback only. The server decides eligibility
 * (Supabase Auth before-user-created hook with a server-side domain allowlist, D-027).
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The primary SRMIST domain, used for hints and placeholders only. */
export const PRIMARY_INSTITUTIONAL_DOMAIN = 'srmist.edu.in';

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isEmailShape(input: string): boolean {
  return EMAIL_SHAPE.test(normalizeEmail(input));
}

/** True when the address is clearly not SRMIST (lets us warn before a network round trip). */
export function isObviouslyNotInstitutional(input: string): boolean {
  const domain = normalizeEmail(input).split('@')[1] ?? '';
  return domain.length > 0 && !domain.endsWith(PRIMARY_INSTITUTIONAL_DOMAIN);
}
