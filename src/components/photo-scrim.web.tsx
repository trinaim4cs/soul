import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

/** Web: react-native-web passes `backgroundImage` straight to CSS. */
export function PhotoScrim({ heightShare = 0.55 }: { heightShare?: number }) {
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        styles.scrim,
        { height: `${heightShare * 100}%`, backgroundImage: colors.photoGradient } as any,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
