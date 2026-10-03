// Web Push for the iPhone PWA and desktop browsers (DECISIONS D-054): message encryption
// (RFC 8291, aes128gcm per RFC 8188) and VAPID (RFC 8292). Runs in Deno (Edge Functions) and
// in Node (unit tests): only fetch and WebCrypto are used, no third-party code.

const encoder = new TextEncoder();

/** Bytes backed by a plain ArrayBuffer, which is what WebCrypto and fetch accept. */
export type Bytes = Uint8Array<ArrayBuffer>;

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(text: string): Bytes {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const imported = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, data));
}

/** HKDF-Expand for a single block (every output here is at most 32 bytes). */
async function expand(prk: Bytes, info: Bytes, length: number): Promise<Bytes> {
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

/** A P-256 key from its uncompressed public point and, optionally, its private scalar. */
function p256Jwk(publicKey: Uint8Array, privateKey?: Uint8Array): JsonWebKey {
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('invalid P-256 public key');
  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(publicKey.slice(1, 33)),
    y: base64UrlEncode(publicKey.slice(33, 65)),
    ...(privateKey ? { d: base64UrlEncode(privateKey) } : {}),
    ext: true,
  };
}

export type EncryptInput = {
  plaintext: Bytes;
  /** The subscription's `p256dh` key (65 bytes) and `auth` secret (16 bytes). */
  uaPublic: Bytes;
  authSecret: Bytes;
  /** Fixed only by tests: a new key pair and salt are made for every message otherwise. */
  salt?: Bytes;
  asKeys?: { publicKey: Bytes; privateKey: Bytes };
  recordSize?: number;
};

/** Encrypts one push message as a single aes128gcm record (RFC 8291 section 3). */
export async function encryptPayload(input: EncryptInput): Promise<Bytes> {
  const recordSize = input.recordSize ?? 4096;
  if (input.authSecret.length !== 16) throw new Error('invalid auth secret');
  if (input.plaintext.length + 17 > recordSize) throw new Error('payload too large');

  let asPublic: Bytes;
  let asPrivate: CryptoKey;
  if (input.asKeys) {
    asPublic = input.asKeys.publicKey;
    asPrivate = await crypto.subtle.importKey(
      'jwk',
      p256Jwk(input.asKeys.publicKey, input.asKeys.privateKey),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    asPrivate = pair.privateKey;
  }
  const uaKey = await crypto.subtle.importKey(
    'raw',
    input.uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivate, 256),
  );

  const prkKey = await hmac(input.authSecret, ecdhSecret);
  const keyInfo = concat(encoder.encode('WebPush: info\0'), input.uaPublic, asPublic);
  const ikm = await expand(prkKey, keyInfo, 32);
  const salt = input.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = await expand(prk, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await expand(prk, encoder.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // One record, so it is the last one: the plaintext ends with the 0x02 delimiter.
  const record = concat(input.plaintext, new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record),
  );

  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

/** The VAPID JWT for one push service origin, signed ES256 (RFC 8292 section 2). */
export async function vapidToken(
  audience: string,
  keys: VapidKeys,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    p256Jwk(base64UrlDecode(keys.publicKey), base64UrlDecode(keys.privateKey)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({ aud: audience, exp: nowSeconds + 12 * 3600, sub: keys.subject }),
    ),
  );
  // WebCrypto returns ECDSA signatures as r || s, the JWS form.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      encoder.encode(`${header}.${claims}`),
    ),
  );
  return `${header}.${claims}.${base64UrlEncode(signature)}`;
}

/**
 * Push services SOUL delivers to. A subscription endpoint elsewhere is refused at
 * registration, so the server never posts to an address a client made up.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    PUSH_HOSTS.some((host) => host.test(url.hostname))
  );
}

/** A `Topic` header (at most 32 URL-safe characters) from a collapse key. */
export async function pushTopic(collapseKey: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(collapseKey)));
  return base64UrlEncode(digest).slice(0, 32);
}

export type PushOutcome = 'sent' | 'gone' | 'retry' | 'failed';

/** 404 and 410 mean the subscription is gone; 429 and 5xx are worth another try. */
export function webPushOutcome(status: number): PushOutcome {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 404 || status === 410) return 'gone';
  if (status === 429 || status >= 500) return 'retry';
  return 'failed';
}

export type WebSubscription = { endpoint: string; p256dh: string; auth: string };

export async function sendWebPush(
  subscription: WebSubscription,
  payload: unknown,
  keys: VapidKeys,
  options: { topic?: string | null; urgent?: boolean; ttlSeconds?: number } = {},
): Promise<{ outcome: PushOutcome; status: number }> {
  if (!isPushEndpoint(subscription.endpoint)) return { outcome: 'gone', status: 0 };
  const body = await encryptPayload({
    plaintext: encoder.encode(JSON.stringify(payload)),
    uaPublic: base64UrlDecode(subscription.p256dh),
    authSecret: base64UrlDecode(subscription.auth),
  });
  const token = await vapidToken(new URL(subscription.endpoint).origin, keys);
  const headers: Record<string, string> = {
    authorization: `vapid t=${token}, k=${keys.publicKey}`,
    'content-encoding': 'aes128gcm',
    'content-type': 'application/octet-stream',
    ttl: String(options.ttlSeconds ?? 24 * 3600),
    urgency: options.urgent ? 'high' : 'normal',
  };
  if (options.topic) headers.topic = await pushTopic(options.topic);
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers,
    body,
    redirect: 'error',
  });
  await response.body?.cancel();
  return { outcome: webPushOutcome(response.status), status: response.status };
}
