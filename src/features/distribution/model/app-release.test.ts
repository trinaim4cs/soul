import { androidReleaseSchema, updateNeed, type AndroidRelease } from './app-release';

const release: AndroidRelease = {
  latest_version: '1.2.0',
  latest_version_code: 1_002_000,
  min_version_code: 1_000_000,
  apk_url: 'https://soul.example.invalid/download',
  sha256: 'a'.repeat(64),
};

describe('updateNeed', () => {
  it('requires an update below the oldest supported build', () => {
    expect(updateNeed(999_000, release)).toBe('required');
  });

  it('offers one below the latest build', () => {
    expect(updateNeed(1_001_004, release)).toBe('optional');
  });

  it('says nothing to a current build, the web, or before the first release', () => {
    expect(updateNeed(1_002_000, release)).toBe('none');
    expect(updateNeed(null, release)).toBe('none');
    expect(updateNeed(1000, { ...release, apk_url: null })).toBe('none');
    expect(updateNeed(1000, null)).toBe('none');
  });
});

describe('androidReleaseSchema', () => {
  it('reads the row as seeded before any release', () => {
    const seeded = {
      latest_version: null,
      latest_version_code: 0,
      min_version_code: 0,
      apk_url: null,
      sha256: null,
    };
    expect(androidReleaseSchema.parse(seeded).latest_version_code).toBe(0);
  });

  it('refuses a download address that is not HTTPS', () => {
    expect(
      androidReleaseSchema.safeParse({ ...release, apk_url: 'http://soul.example.invalid' })
        .success,
    ).toBe(false);
  });
});
