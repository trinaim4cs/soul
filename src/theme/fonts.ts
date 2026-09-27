/**
 * Brand fonts and the icon font are embedded in the native app at build time by the
 * expo-font config plugin (app.config.ts), so they are ready before the first frame.
 * The web counterpart is `fonts.web.ts`.
 */
export function useFontsReady(): boolean {
  return true;
}
