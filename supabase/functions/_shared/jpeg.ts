// JPEG checks and metadata stripping for uploaded photos (DECISIONS D-043).
// Pure byte handling with no imports, so the same file runs in Deno and in Jest.
//
// The output keeps only what a decoder needs to draw the picture: quantisation and Huffman
// tables, the frame header, restart interval and the scans. Everything else is dropped:
// EXIF (including GPS and camera serials), XMP, ICC profiles, maker notes, thumbnails,
// comments, and any bytes after the end-of-image marker. A minimal JFIF header is written
// in their place.

export type JpegRejection = 'not_jpeg' | 'malformed' | 'unsupported';

export class JpegError extends Error {
  constructor(readonly reason: JpegRejection) {
    super(reason);
  }
}

export type CleanJpeg = { bytes: Uint8Array; width: number; height: number };

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const DQT = 0xdb;
const DHT = 0xc4;
const DRI = 0xdd;
/** Huffman-coded baseline, extended sequential and progressive frames. */
const SUPPORTED_FRAMES = new Set([0xc0, 0xc1, 0xc2]);
/** Arithmetic, lossless and hierarchical frames: valid JPEG, but not what the app produces. */
const OTHER_FRAMES = new Set([0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** JFIF 1.01, no density, no thumbnail. */
const JFIF = [
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00,
];

/** Validates the structure of a JPEG and returns a copy without metadata. Throws `JpegError`. */
export function cleanJpeg(input: Uint8Array): CleanJpeg {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== SOI) {
    throw new JpegError('not_jpeg');
  }
  const parts: Uint8Array[] = [Uint8Array.of(0xff, SOI), Uint8Array.from(JFIF)];
  let size: { width: number; height: number } | null = null;
  let scans = 0;
  let i = 2;

  for (;;) {
    if (i >= input.length || input[i] !== 0xff) throw new JpegError('malformed');
    // Any number of 0xFF fill bytes may precede a marker.
    while (i < input.length && input[i] === 0xff) i += 1;
    if (i >= input.length) throw new JpegError('malformed');
    const marker = input[i]!;
    i += 1;

    if (marker === EOI) {
      if (!size || scans === 0) throw new JpegError('malformed');
      parts.push(Uint8Array.of(0xff, EOI));
      break;
    }
    // Standalone markers (SOI, restart, TEM) are not valid between segments.
    if (marker === SOI || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      throw new JpegError('malformed');
    }
    if (i + 2 > input.length) throw new JpegError('malformed');
    const length = (input[i]! << 8) | input[i + 1]!;
    const end = i + length;
    if (length < 2 || end > input.length) throw new JpegError('malformed');
    const segment = input.subarray(i - 2, end);

    if (OTHER_FRAMES.has(marker)) throw new JpegError('unsupported');
    if (SUPPORTED_FRAMES.has(marker)) {
      if (size || length < 8) throw new JpegError('malformed');
      const height = (input[i + 3]! << 8) | input[i + 4]!;
      const width = (input[i + 5]! << 8) | input[i + 6]!;
      const components = input[i + 7]!;
      if (input[i + 2] !== 8 || (components !== 1 && components !== 3)) {
        throw new JpegError('unsupported');
      }
      if (width === 0 || height === 0 || length !== 8 + components * 3) {
        throw new JpegError('malformed');
      }
      size = { width, height };
      parts.push(segment);
      i = end;
      continue;
    }
    if (marker === DQT || marker === DHT || marker === DRI) {
      parts.push(segment);
      i = end;
      continue;
    }
    if (marker === SOS) {
      if (!size) throw new JpegError('malformed');
      // Entropy-coded data runs to the next marker; 0xFF00 is a stuffed byte and
      // 0xFFD0–0xFFD7 are restart markers inside the scan.
      let j = end;
      while (j + 1 < input.length) {
        if (input[j] === 0xff) {
          const next = input[j + 1]!;
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      if (j + 1 >= input.length) throw new JpegError('malformed');
      parts.push(input.subarray(i - 2, j));
      scans += 1;
      i = j;
      continue;
    }
    // APPn, COM and anything else: metadata, dropped.
    i = end;
  }

  if (!size) throw new JpegError('malformed');
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return { bytes, width: size.width, height: size.height };
}

/** Published profile photos are portrait 4:5, 200 to 1080 pixels wide (D-041). */
export function isProfilePhotoSize(width: number, height: number): boolean {
  return width >= 200 && width <= 1080 && Math.abs(height - width * 1.25) <= 3;
}

/** The anonymous-mode copy must stay tiny so no detail can be recovered from it (D-041). */
export function isTinyPhotoSize(width: number, height: number): boolean {
  return width <= 32 && height <= 40;
}
