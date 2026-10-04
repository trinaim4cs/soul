import { useIsFocused } from 'expo-router';
import { StatusBar, type StatusBarStyle } from 'expo-status-bar';

/**
 * A status bar style for one screen, applied only while that screen is in front. A screen
 * deeper in a stack stays mounted, so an unconditional style would outlive it: the black
 * welcome screen's light icons stayed on and vanished against the white screens after it.
 */
export function ScreenStatusBar({ style }: { style: StatusBarStyle }) {
  const focused = useIsFocused();
  return focused ? <StatusBar style={style} /> : null;
}
