/**
 * Native: the keyboard is handled by react-native-keyboard-controller (SoulScreen), so no extra
 * inset is needed. The web version lifts content above the on-screen keyboard.
 */
export function useKeyboardInset(): number {
  return 0;
}
