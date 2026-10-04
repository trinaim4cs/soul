import type { ImageSource } from 'expo-image';

/**
 * A signed URL gets a new token every time it is made, but the photo behind it is the same,
 * so the device cache is keyed on the URL without its token (bucket and path; a replaced
 * photo gets a new path). Without this, every renewed URL downloads the photo again.
 */
export function stableSource(source: ImageSource): ImageSource {
  if (source.cacheKey || !source.uri) return source;
  const base = source.uri.split('?')[0] ?? '';
  return base.includes('/storage/v1/object/sign/') ? { ...source, cacheKey: base } : source;
}
