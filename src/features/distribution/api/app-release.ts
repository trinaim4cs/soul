import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  androidReleaseSchema,
  updateNeed,
  type AndroidRelease,
  type UpdateNeed,
} from '@/features/distribution/model/app-release';
import { supabase } from '@/lib/supabase';

/** This installed Android build's number (app.config.ts); none on the web, which is always current. */
export const installedVersionCode: number | null =
  Platform.OS === 'android' && typeof Constants.expoConfig?.extra?.versionCode === 'number'
    ? Constants.expoConfig.extra.versionCode
    : null;

/** The current APK as the server describes it, read after sign-in (D-039). */
export function useAndroidRelease(signedIn: boolean) {
  return useQuery({
    queryKey: ['android-release'],
    enabled: signedIn && installedVersionCode !== null,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<AndroidRelease | null> => {
      const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'android_release')
        .maybeSingle();
      if (error) throw error;
      const parsed = androidReleaseSchema.safeParse(data?.value);
      return parsed.success ? parsed.data : null;
    },
  });
}

export function useUpdateNeed(signedIn: boolean): {
  need: UpdateNeed;
  release: AndroidRelease | null;
} {
  const release = useAndroidRelease(signedIn).data ?? null;
  return { need: updateNeed(installedVersionCode, release), release };
}
