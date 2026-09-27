// Runs under Jest (the module has no Deno imports). Fixtures: scripts/fixtures (placeholder art).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanJpeg, isProfilePhotoSize, isTinyPhotoSize, JpegError } from './jpeg';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, '../../../scripts/fixtures', name)));

const contains = (bytes: Uint8Array, text: string) =>
  Buffer.from(bytes).includes(Buffer.from(text, 'latin1'));

function reason(run: () => unknown) {
  try {
    run();
  } catch (error) {
    return error instanceof JpegError ? error.reason : 'other';
  }
  return 'accepted';
}

/** Marker bytes of each segment, in order, up to the first scan. */
function markers(bytes: Uint8Array) {
  const found: number[] = [];
  let i = 2;
  while (i < bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1]!;
    found.push(marker);
    if (marker === 0xda) break;
    i += 2 + ((bytes[i + 2]! << 8) | bytes[i + 3]!);
  }
  return found;
}

describe('cleanJpeg', () => {
  const original = fixture('photo-with-metadata.jpg');
  const clean = cleanJpeg(original);

  it('reads the real size from the frame header', () => {
    expect([clean.width, clean.height]).toEqual([400, 500]);
  });

  it('removes EXIF, GPS, XMP, ICC, comments and trailing bytes', () => {
    for (const text of [
      'Exif',
      'FixtureCam',
      'SERIAL',
      'fixture-xmp',
      'ICC_PROFILE',
      'fixture comment',
    ]) {
      expect(contains(original, text)).toBe(true);
      expect(contains(clean.bytes, text)).toBe(false);
    }
    expect(contains(clean.bytes, 'TRAILING-PAYLOAD')).toBe(false);
    expect([...clean.bytes.slice(-2)]).toEqual([0xff, 0xd9]);
  });

  it('keeps only a plain JFIF header and the decoding segments', () => {
    expect([...clean.bytes.slice(0, 2)]).toEqual([0xff, 0xd8]);
    const kept = new Set(markers(clean.bytes));
    expect(markers(clean.bytes)[0]).toBe(0xe0);
    for (const marker of kept) {
      expect([0xe0, 0xdb, 0xc4, 0xc0, 0xc1, 0xc2, 0xdd, 0xda]).toContain(marker);
    }
  });

  it('keeps the picture data byte for byte', () => {
    const scan = (bytes: Uint8Array) => {
      const start = Buffer.from(bytes).indexOf(Buffer.from([0xff, 0xda]));
      const end = Buffer.from(bytes).lastIndexOf(Buffer.from([0xff, 0xd9]));
      return Buffer.from(bytes.subarray(start, end));
    };
    expect(scan(clean.bytes).equals(scan(original))).toBe(true);
  });

  it('is stable when run twice', () => {
    expect(Buffer.from(cleanJpeg(clean.bytes).bytes).equals(Buffer.from(clean.bytes))).toBe(true);
  });

  it('accepts progressive JPEGs with several scans', () => {
    const progressive = cleanJpeg(fixture('photo-progressive.jpg'));
    expect([progressive.width, progressive.height]).toEqual([400, 500]);
    expect([...progressive.bytes.slice(-2)]).toEqual([0xff, 0xd9]);
  });

  it('rejects files that are not JPEGs', () => {
    expect(reason(() => cleanJpeg(new TextEncoder().encode('<html>hello</html>')))).toBe(
      'not_jpeg',
    );
    const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(reason(() => cleanJpeg(png))).toBe('not_jpeg');
  });

  it('rejects truncated and corrupt files', () => {
    expect(reason(() => cleanJpeg(original.slice(0, original.length / 2)))).toBe('malformed');
    expect(reason(() => cleanJpeg(Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)))).toBe('malformed');
    const badLength = original.slice();
    badLength[4] = 0xff;
    badLength[5] = 0xff;
    expect(reason(() => cleanJpeg(badLength))).toBe('malformed');
  });

  it('rejects arithmetic-coded frames', () => {
    const sof0 = Buffer.from(original).indexOf(Buffer.from([0xff, 0xc0]));
    const arithmetic = original.slice();
    arithmetic[sof0 + 1] = 0xc9;
    expect(reason(() => cleanJpeg(arithmetic))).toBe('unsupported');
  });
});

describe('photo size rules', () => {
  it('accepts portrait 4:5 photos from 200 to 1080 pixels wide', () => {
    expect(isProfilePhotoSize(1080, 1350)).toBe(true);
    expect(isProfilePhotoSize(853, 1066)).toBe(true);
    expect(isProfilePhotoSize(400, 400)).toBe(false);
    expect(isProfilePhotoSize(1600, 2000)).toBe(false);
    expect(isProfilePhotoSize(160, 200)).toBe(false);
  });

  it('keeps the anonymous copy tiny', () => {
    expect(isTinyPhotoSize(24, 30)).toBe(true);
    expect(isTinyPhotoSize(400, 500)).toBe(false);
  });
});
