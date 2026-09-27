import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

/**
 * The current APK, described by `/downloads/latest.json` on the SOUL site. The release step
 * writes it next to the APK (BUILD_ANDROID.md). The site itself serves it, so the download
 * page works without an account and without Supabase.
 */
const latestApkSchema = z.object({
  version: z.string().min(1),
  url: z.string().regex(/^(\/|https:\/\/)/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive(),
});

export type LatestApk = z.infer<typeof latestApkSchema>;

export async function fetchLatestApk(): Promise<LatestApk | null> {
  const response = await fetch('/downloads/latest.json', { cache: 'no-store' });
  // Before the first release there is no file (a single-page host answers with the app shell).
  const isJson = response.headers.get('content-type')?.includes('json') ?? false;
  if (response.status === 404 || (response.ok && !isJson)) return null;
  if (!response.ok) throw new Error(`latest.json: HTTP ${response.status}`);
  return latestApkSchema.parse(await response.json());
}

export function useLatestApk() {
  return useQuery({ queryKey: ['latest-apk'], queryFn: fetchLatestApk, staleTime: 5 * 60_000 });
}
