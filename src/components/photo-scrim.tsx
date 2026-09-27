import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

/** Bottom fade over a photo so white text stays legible (native CSS gradients, New Architecture). */
export function PhotoScrim({ heightShare = 0.55 }: { heightShare?: number }) {
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        styles.scrim,
        { height: `${heightShare * 100}%`, experimental_backgroundImage: colors.photoGradient },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
