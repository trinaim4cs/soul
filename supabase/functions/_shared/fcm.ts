// Android push through Firebase Cloud Messaging HTTP v1 (DECISIONS D-018, D-054). The
// service account stays a server secret (FCM_SERVICE_ACCOUNT); the app only holds the public
// google-services.json. Runs in Deno and in Node (unit tests): only fetch and WebCrypto.

import { base64UrlEncode, type PushOutcome } from './webpush.ts';

const encoder = new TextEncoder();
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';

export type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return parsed as ServiceAccount;
  } catch {
    return null;
  }
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
}

/** The OAuth assertion Google exchanges for an access token (RS256, one hour). */
export async function serviceAccountJwt(
  account: ServiceAccount,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        iss: account.client_email,
        scope: SCOPE,
        aud: account.token_uri ?? TOKEN_URI,
        iat: nowSeconds,
        exp: nowSeconds + 3600,
      }),
    ),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${claims}`)),
  );
  return `${header}.${claims}.${base64UrlEncode(signature)}`;
}

let cached: { token: string; expiresAt: number; account: string } | null = null;

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (cached && cached.account === account.client_email && cached.expiresAt - 60_000 > now) {
    return cached.token;
  }
  const response = await fetch(account.token_uri ?? TOKEN_URI, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: await serviceAccountJwt(account),
    }),
  });
  if (!response.ok) throw new Error(`fcm_auth_${response.status}`);
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cached = {
    token: body.access_token,
    expiresAt: now + body.expires_in * 1000,
    account: account.client_email,
  };
  return body.access_token;
}

export type PushContent = {
  title: string;
  body: string;
  url: string;
  collapseKey?: string | null;
  urgent?: boolean;
};

/**
 * The FCM message. The system shows it while the app is in the background; the lock screen
 * hides its text (`PRIVATE`), and a later message with the same tag replaces it.
 */
export function fcmMessage(token: string, content: PushContent) {
  return {
    message: {
      token,
      notification: { title: content.title, body: content.body },
      data: { url: content.url },
      android: {
        priority: content.urgent ? 'HIGH' : 'NORMAL',
        ttl: '86400s',
        ...(content.collapseKey ? { collapse_key: content.collapseKey } : {}),
        notification: {
          channel_id: 'activity',
          visibility: 'PRIVATE',
          ...(content.collapseKey ? { tag: content.collapseKey } : {}),
        },
      },
    },
  };
}

type FcmError = { error?: { status?: string; details?: { errorCode?: string }[] } };

/** UNREGISTERED (the app was removed or the token replaced) stops the device. */
export function fcmOutcome(status: number, body: FcmError | null): PushOutcome {
  if (status >= 200 && status < 300) return 'sent';
  const codes = [body?.error?.status, ...(body?.error?.details ?? []).map((d) => d.errorCode)];
  if (status === 404 || codes.includes('UNREGISTERED')) return 'gone';
  if (status === 429 || status >= 500 || codes.includes('UNAVAILABLE')) return 'retry';
  return 'failed';
}

export async function sendFcm(
  account: ServiceAccount,
  token: string,
  content: PushContent,
): Promise<{ outcome: PushOutcome; status: number }> {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await accessToken(account)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(fcmMessage(token, content)),
    },
  );
  const body = response.ok ? null : ((await response.json().catch(() => null)) as FcmError | null);
  if (response.ok) await response.body?.cancel();
  return { outcome: fcmOutcome(response.status, body), status: response.status };
}
