/**
 * Registers the app-shell-only service worker (public/sw.js, DECISIONS D-040) in production
 * web builds. Development skips it so the dev server is never shadowed by a cache.
 */
export function registerServiceWorker(): void {
  if (__DEV__ || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
