import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { z } from 'zod';

export type AppEnv = 'development' | 'production';

const DEV_STATUS_OVERRIDES = ['signed-out', 'onboarding', 'eligible'] as const;
export type DevStatusOverride = (typeof DEV_STATUS_OVERRIDES)[number];

const envSchema = z.object({
  appEnv: z.enum(['development', 'production']),
  supabaseUrl: z.url(),
  supabaseAnonKey: z.string().min(1),
  devStatusOverride: z.enum(DEV_STATUS_OVERRIDES).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Local development: `.env` uses the Android emulator's alias for the host machine
 * (10.0.2.2). A browser on the host reaches the same local Supabase at localhost.
 */
export function resolveDevSupabaseUrl(
  url: string | undefined,
  platform: string,
): string | undefined {
  if (!url || platform !== 'web') return url;
  return url.replace('//10.0.2.2:', '//localhost:');
}

function readEnv(): Env {
  const appEnv: AppEnv =
    Constants.expoConfig?.extra?.APP_ENV === 'production' ? 'production' : 'development';

  // EXPO_PUBLIC_* values must be referenced statically so Metro can inline them.
  const rawOverride = process.env.EXPO_PUBLIC_DEV_STATUS_OVERRIDE;

  const parsed = envSchema.safeParse({
    appEnv,
    supabaseUrl:
      appEnv === 'development'
        ? resolveDevSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL, Platform.OS)
        : process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // Development-only preview switch; never honoured in production builds.
    devStatusOverride: appEnv === 'development' && __DEV__ && rawOverride ? rawOverride : undefined,
  });

  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid app configuration (${fields}). See .env.example.`);
  }
  return parsed.data;
}

export const env = readEnv();

export const isDevelopment = env.appEnv === 'development';
