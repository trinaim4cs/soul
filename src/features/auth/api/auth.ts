import { accountStatusQueryKey } from '@/features/auth/api/account-status';
import { normalizeEmail } from '@/features/auth/model/email';
import { forgetSignedUrls } from '@/features/profile/api/signed-urls';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { notifications } from '@/services/notifications';

/**
 * Sends a 6-digit sign-in code. The server rejects any non-SRMIST domain (D-027).
 * The rules version ticked before sign-in travels with sign-up and is recorded by the
 * server when the account is created (D-029).
 */
export async function requestCode(email: string, acceptedTermsVersion: string | null) {
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: {
      shouldCreateUser: true,
      data: acceptedTermsVersion ? { accepted_terms_version: acceptedTermsVersion } : undefined,
    },
  });
  if (error) throw error;
}

export async function verifyCode(email: string, code: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizeEmail(email),
    token: code,
    type: 'email',
  });
  if (error) throw error;
  return data.session;
}

type AcceptTermsResult = { ok: true } | { ok: false; reason: 'outdated_terms' };

export async function acceptTerms(version: string): Promise<AcceptTermsResult> {
  const { data, error } = await supabase.rpc('accept_terms', { p_version: version });
  if (error) throw error;
  return data as AcceptTermsResult;
}

export type SetDobResult =
  | { ok: true; zodiac: string }
  | { ok: false; reason: 'underage' | 'age_gate_locked' | 'already_set' | 'invalid_date' };

export async function setDateOfBirth(isoDate: string): Promise<SetDobResult> {
  const { data, error } = await supabase.rpc('set_date_of_birth', { p_dob: isoDate });
  if (error) throw error;
  return data as SetDobResult;
}

export async function signOut() {
  // This device stops receiving the person's notifications first (D-054); never blocks sign-out.
  await Promise.race([
    notifications.unregister(),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  await supabase.auth.signOut();
  forgetSignedUrls();
  queryClient.removeQueries({ queryKey: ['account-status'] });
}

/** Re-reads the server status after any onboarding step so routing follows the server. */
export async function refreshAccountStatus(userId: string) {
  await queryClient.invalidateQueries({ queryKey: accountStatusQueryKey(userId) });
}
