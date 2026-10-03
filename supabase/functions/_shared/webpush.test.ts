import {
  base64UrlDecode,
  base64UrlEncode,
  encryptPayload,
  isPushEndpoint,
  pushTopic,
  vapidToken,
  webPushOutcome,
} from './webpush';

// RFC 8291 appendix A, the published test vector.
const RFC = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  header:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
};

/** Decrypts as the browser would, to prove a fresh message round-trips. */
async function decrypt(
  message: Uint8Array,
  uaPrivate: Uint8Array,
  uaPublic: Uint8Array,
  auth: Uint8Array,
) {
  const salt = message.slice(0, 16);
  const idlen = message[20]!;
  const asPublic = message.slice(21, 21 + idlen);
  const ciphertext = message.slice(21 + idlen);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(uaPublic.slice(1, 33)),
    y: base64UrlEncode(uaPublic.slice(33)),
    d: base64UrlEncode(uaPrivate),
  };
  const priv = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const pub = await crypto.subtle.importKey(
    'raw',
    asPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256),
  );
  const mac = async (key: Uint8Array, data: Uint8Array) =>
    new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
          'sign',
        ]),
        data,
      ),
    );
  const enc = new TextEncoder();
  const join = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => [...part]));
  const ikm = await mac(
    await mac(auth, ecdh),
    join(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])),
  );
  const prk = await mac(salt, ikm);
  const cek = (
    await mac(prk, join(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))
  ).slice(0, 16);
  const nonce = (
    await mac(prk, join(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))
  ).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const record = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext),
  );
  expect(record[record.length - 1]).toBe(2);
  return new TextDecoder().decode(record.slice(0, -1));
}

describe('Web Push encryption (RFC 8291)', () => {
  it('reproduces the RFC test vector byte for byte', async () => {
    const message = await encryptPayload({
      plaintext: base64UrlDecode(RFC.plaintext),
      uaPublic: base64UrlDecode(RFC.uaPublic),
      authSecret: base64UrlDecode(RFC.authSecret),
      salt: base64UrlDecode(RFC.salt),
      asKeys: {
        publicKey: base64UrlDecode(RFC.asPublic),
        privateKey: base64UrlDecode(RFC.asPrivate),
      },
    });
    // The RFC prints the 86-byte header and the record separately.
    expect(base64UrlEncode(message.slice(0, 86))).toBe(RFC.header);
    expect(base64UrlEncode(message.slice(86))).toBe(RFC.ciphertext);
  });

  it('uses a fresh key and salt for every message, and the recipient can read it', async () => {
    const options = {
      plaintext: new TextEncoder().encode('{"title":"It\'s a match"}'),
      uaPublic: base64UrlDecode(RFC.uaPublic),
      authSecret: base64UrlDecode(RFC.authSecret),
    };
    const one = await encryptPayload(options);
    const two = await encryptPayload(options);
    expect(base64UrlEncode(one.slice(0, 16))).not.toBe(base64UrlEncode(two.slice(0, 16)));
    await expect(
      decrypt(
        one,
        base64UrlDecode(RFC.uaPrivate),
        base64UrlDecode(RFC.uaPublic),
        base64UrlDecode(RFC.authSecret),
      ),
    ).resolves.toBe('{"title":"It\'s a match"}');
  });

  it('refuses what does not fit one record', async () => {
    await expect(
      encryptPayload({
        plaintext: new Uint8Array(4090),
        uaPublic: base64UrlDecode(RFC.uaPublic),
        authSecret: base64UrlDecode(RFC.authSecret),
      }),
    ).rejects.toThrow('payload too large');
  });
});

describe('VAPID (RFC 8292)', () => {
  it('signs a short-lived ES256 token for the push service origin', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const token = await vapidToken(
      'https://fcm.googleapis.com',
      {
        publicKey: base64UrlEncode(publicKey),
        privateKey: jwk.d!,
        subject: 'mailto:support@example.invalid',
      },
      1_000,
    );
    const [header, claims, signature] = token.split('.');
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(header!)))).toEqual({
      typ: 'JWT',
      alg: 'ES256',
    });
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(claims!)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 1_000 + 12 * 3600,
      sub: 'mailto:support@example.invalid',
    });
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      base64UrlDecode(signature!),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});

describe('delivery rules', () => {
  it('only posts to the known push services', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/QK1')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com.example.invalid/x')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(isPushEndpoint('https://user@fcm.googleapis.com/x')).toBe(false);
    expect(isPushEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(isPushEndpoint('not a url')).toBe(false);
  });

  it('makes a short topic from a collapse key', async () => {
    const topic = await pushTopic('chat:00000000-0000-4000-8000-000000000001');
    expect(topic).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await pushTopic('chat:00000000-0000-4000-8000-000000000001')).toBe(topic);
  });

  it('stops a gone subscription and retries a busy service', () => {
    expect(webPushOutcome(201)).toBe('sent');
    expect(webPushOutcome(410)).toBe('gone');
    expect(webPushOutcome(404)).toBe('gone');
    expect(webPushOutcome(429)).toBe('retry');
    expect(webPushOutcome(503)).toBe('retry');
    expect(webPushOutcome(403)).toBe('failed');
  });
});
