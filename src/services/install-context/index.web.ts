import { classifyBrowser, type InstallContext } from './model';

export type { InstallContext } from './model';

export function getInstallContext(): InstallContext {
  if (typeof window === 'undefined') return 'other-browser';
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return classifyBrowser({
    userAgent: nav.userAgent,
    standalone:
      window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
  });
}
