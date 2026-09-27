import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

import { HttpError } from './http.ts';

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

/**
 * Hosted projects provide the new API keys as JSON dictionaries (`SUPABASE_PUBLISHABLE_KEYS`,
 * `SUPABASE_SECRET_KEYS`) and may also provide the legacy JWT keys. Prefer the new ones.
 */
function apiKey(dictionary: string, legacy: string): string {
  const raw = Deno.env.get(dictionary);
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>;
      const key = keys.default ?? Object.values(keys)[0];
      if (key) return key;
    } catch {
      // Fall through to the legacy key.
    }
  }
  return env(legacy);
}

/** Resolves the calling user from their JWT. Every user-facing function starts here. */
export async function requireUser(req: Request): Promise<{ user: User; client: SupabaseClient }> {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new HttpError('unauthorized', 'Sign in again.');
  }
  // A client acting as the caller: RLS applies to everything it reads or writes.
  const client = createClient(
    env('SUPABASE_URL'),
    apiKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'),
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new HttpError('unauthorized', 'Sign in again.');
  }
  return { user: data.user, client };
}

/**
 * Service-role client for server-authoritative writes. The key exists only as an Edge
 * Function secret and never in the app bundle (SECURITY_MODEL section 9).
 */
export function serviceClient(): SupabaseClient {
  return createClient(
    env('SUPABASE_URL'),
    apiKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
