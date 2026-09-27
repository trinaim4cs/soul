import type { InstallContext } from './model';

export type { InstallContext } from './model';

/** Native builds are the installed app. */
export function getInstallContext(): InstallContext {
  return 'native-app';
}
