import { fcmMessage, fcmOutcome, parseServiceAccount, serviceAccountJwt } from './fcm';
import { base64UrlDecode } from './webpush';

async function testAccount() {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let binary = '';
  for (const byte of der) binary += String.fromCharCode(byte);
  const lines = btoa(binary)
    .match(/.{1,64}/g)!
    .join('\n');
  return {
    publicKey: pair.publicKey,
    account: {
      project_id: 'soul-test',
      client_email: 'push@soul-test.iam.gserviceaccount.com',
      private_key: `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`,
    },
  };
}

describe('FCM service account', () => {
  it('reads only a complete service account', () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount('not json')).toBeNull();
    expect(parseServiceAccount('{"project_id":"x"}')).toBeNull();
    expect(
      parseServiceAccount('{"project_id":"x","client_email":"y","private_key":"z"}')?.project_id,
    ).toBe('x');
  });

  it('signs an RS256 assertion for the messaging scope', async () => {
    const { account, publicKey } = await testAccount();
    const jwt = await serviceAccountJwt(account, 1_000);
    const [header, claims, signature] = jwt.split('.');
    const decode = (part: string) => JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));
    expect(decode(header!)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(claims!)).toEqual({
      iss: 'push@soul-test.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_000,
      exp: 4_600,
    });
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      base64UrlDecode(signature!),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});

describe('FCM message', () => {
  it('opens a page inside SOUL, hides its text on the lock screen and replaces per chat', () => {
    const message = fcmMessage('device-token', {
      title: 'Profile 01',
      body: 'Sent you a message',
      url: '/chat/00000000-0000-4000-8000-000000000001',
      collapseKey: 'chat:00000000-0000-4000-8000-000000000001',
      urgent: true,
    }).message;
    expect(message.data).toEqual({ url: '/chat/00000000-0000-4000-8000-000000000001' });
    expect(message.android.notification).toEqual({
      channel_id: 'activity',
      visibility: 'PRIVATE',
      tag: 'chat:00000000-0000-4000-8000-000000000001',
    });
    expect(message.android.priority).toBe('HIGH');
  });

  it('stops an unregistered token and retries an unavailable service', () => {
    expect(fcmOutcome(200, null)).toBe('sent');
    expect(
      fcmOutcome(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }),
    ).toBe('gone');
    expect(
      fcmOutcome(400, {
        error: { status: 'INVALID_ARGUMENT', details: [{ errorCode: 'UNREGISTERED' }] },
      }),
    ).toBe('gone');
    expect(fcmOutcome(503, { error: { status: 'UNAVAILABLE' } })).toBe('retry');
    expect(fcmOutcome(429, null)).toBe('retry');
    expect(fcmOutcome(400, { error: { status: 'INVALID_ARGUMENT' } })).toBe('failed');
  });
});
