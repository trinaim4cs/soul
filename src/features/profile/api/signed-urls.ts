/**
 * Signed photo URLs, reused across screens (Phase 19). The same photo appears on a card, in
 * the profile viewer, a match row and a chat header; signing it separately for each would
 * make a new URL every time, so the image cache would download the same photo again (and
 * every screen would wait on another signing request). A URL is reused while it has at least
 * a quarter of its life left. Kept in memory only and cleared at sign-out.
 */

export const SIGNED_URL_TTL_S = 3600;
const MIN_LEFT_MS = 15 * 60_000;

type Entry = { url: string; expiresAt: number };
const cache = new Map<string, Entry>();

const key = (bucket: string, path: string) => `${bucket}/${path}`;

/** The URLs still worth reusing, and the paths that need signing. */
export function reuseSignedUrls(bucket: string, paths: string[], now: number) {
  const urls: Record<string, string> = {};
  const missing: string[] = [];
  for (const path of paths) {
    const entry = cache.get(key(bucket, path));
    if (entry && entry.expiresAt - now >= MIN_LEFT_MS) urls[path] = entry.url;
    else missing.push(path);
  }
  return { urls, missing };
}

export function rememberSignedUrls(
  bucket: string,
  signed: { path: string | null; signedUrl: string | null }[],
  signedAt: number,
): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const item of signed) {
    if (!item.path || !item.signedUrl) continue;
    cache.set(key(bucket, item.path), {
      url: item.signedUrl,
      expiresAt: signedAt + SIGNED_URL_TTL_S * 1000,
    });
    urls[item.path] = item.signedUrl;
  }
  return urls;
}

export function forgetSignedUrls() {
  cache.clear();
}
