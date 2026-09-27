/**
 * Maps Supabase Auth failures to calm, specific copy. Never exposes raw error strings.
 * Identical copy is used whether or not an account exists (no enumeration).
 */
export type AuthErrorKind =
  'not_institutional' | 'rate_limited' | 'invalid_code' | 'expired_code' | 'network' | 'unknown';

type ErrorLike = { message?: string; status?: number; code?: string; name?: string } | null;

export function classifyAuthError(error: ErrorLike): AuthErrorKind {
  if (!error) return 'unknown';
  const message = (error.message ?? '').toLowerCase();
  const code = (error.code ?? '').toLowerCase();
  if (message.includes('only for srmist') || code === 'hook_rejected' || error.status === 403) {
    return 'not_institutional';
  }
  if (
    error.status === 429 ||
    code.includes('rate_limit') ||
    message.includes('rate limit') ||
    message.includes('security purposes')
  ) {
    return 'rate_limited';
  }
  if (code === 'otp_expired' || message.includes('expired')) return 'expired_code';
  if (message.includes('invalid') || message.includes('token') || code.includes('otp')) {
    return 'invalid_code';
  }
  if (
    error.name === 'AuthRetryableFetchError' ||
    message.includes('network') ||
    message.includes('fetch')
  ) {
    return 'network';
  }
  return 'unknown';
}

export const AUTH_ERROR_COPY: Record<AuthErrorKind, string> = {
  not_institutional: 'SOUL is only for SRMIST students. Use your @srmist.edu.in email.',
  rate_limited: 'Too many attempts. Wait a minute, then try again.',
  invalid_code: 'That code is not right. Check the latest email from SOUL.',
  expired_code: 'That code has expired. Send a new one.',
  network: "Can't reach SOUL. Check your connection and try again.",
  unknown: 'Something went wrong. Try again.',
};

export function authErrorMessage(error: ErrorLike): string {
  return AUTH_ERROR_COPY[classifyAuthError(error)];
}
