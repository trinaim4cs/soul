import { stableSource } from '@/lib/image-source';

import {
  forgetSignedUrls,
  rememberSignedUrls,
  reuseSignedUrls,
  SIGNED_URL_TTL_S,
} from './signed-urls';

const BUCKET = 'profile-photos';
const PATH_A = '00000000-0000-4000-8000-0000000000a1/photo-a.jpg';
const PATH_B = '00000000-0000-4000-8000-0000000000a1/photo-b.jpg';
const signed = (path: string, token: string) => ({
  path,
  signedUrl: `http://127.0.0.1:54321/storage/v1/object/sign/${BUCKET}/${path}?token=${token}`,
});

beforeEach(() => forgetSignedUrls());

describe('signed photo URLs', () => {
  it('signs only what it has not signed yet', () => {
    const now = 1_000_000;
    rememberSignedUrls(BUCKET, [signed(PATH_A, 't1')], now);
    const { urls, missing } = reuseSignedUrls(BUCKET, [PATH_A, PATH_B], now + 60_000);
    expect(urls[PATH_A]).toContain('token=t1');
    expect(missing).toEqual([PATH_B]);
  });

  it('renews a URL with less than a quarter of its hour left', () => {
    const now = 1_000_000;
    rememberSignedUrls(BUCKET, [signed(PATH_A, 't1')], now);
    const later = now + SIGNED_URL_TTL_S * 1000 - 14 * 60_000;
    expect(reuseSignedUrls(BUCKET, [PATH_A], later).missing).toEqual([PATH_A]);
  });

  it('keeps buckets apart and forgets everything at sign-out', () => {
    rememberSignedUrls(BUCKET, [signed(PATH_A, 't1')], 0);
    expect(reuseSignedUrls('profile-photos-blurred', [PATH_A], 0).missing).toEqual([PATH_A]);
    forgetSignedUrls();
    expect(reuseSignedUrls(BUCKET, [PATH_A], 0).missing).toEqual([PATH_A]);
  });
});

describe('stableSource', () => {
  it('caches a signed photo under its URL without the token', () => {
    const first = stableSource({ uri: signed(PATH_A, 't1').signedUrl });
    const renewed = stableSource({ uri: signed(PATH_A, 't2').signedUrl });
    expect(first.cacheKey).toBe(renewed.cacheKey);
    expect(first.cacheKey).not.toContain('token');
  });

  it('leaves other sources alone', () => {
    expect(stableSource({ uri: 'https://example.invalid/a.png?x=1' }).cacheKey).toBeUndefined();
    expect(stableSource({ uri: signed(PATH_A, 't1').signedUrl, cacheKey: 'own' }).cacheKey).toBe(
      'own',
    );
  });
});
