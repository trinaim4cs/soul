/**
 * Maps Supabase Auth failures to calm, specific copy. Never exposes raw error strings.
 * Identical copy is used whether or not an account exists (no enumeration).
 */
export type AuthErrorKind =
  | 'not_institutional'
  | 'email_unavailable'
  | 'rate_limited'
  | 'invalid_code'
  | 'expired_code'
  | 'network'
  | 'unknown';

type ErrorLike = { message?: string; status?: number; code?: string; name?: string } | null;

export function classifyAuthError(error: ErrorLike): AuthErrorKind {
  if (!error) return 'unknown';
  const message = (error.message ?? '').toLowerCase();
  const code = (error.code ?? '').toLowerCase();
  // A wrong or expired code also comes back as HTTP 403 ("Token has expired or is invalid",
  // code otp_expired), so codes are recognised before the sign-up refusals.
  if (code === 'otp_expired' || message.includes('expired or is invalid')) return 'invalid_code';
  if (message.includes("can't be used")) {
    return 'email_unavailable';
  }
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
  email_unavailable: "This email can't be used for SOUL.",
  invalid_code: "That code didn't work. Check the latest email from SOUL, or send a new code.",
  expired_code: 'That code has expired. Send a new one.',
  network: "Can't reach SOUL. Check your connection and try again.",
  unknown: 'Something went wrong. Try again.',
};

export function authErrorMessage(error: ErrorLike): string {
  return AUTH_ERROR_COPY[classifyAuthError(error)];
}
