import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { SoulButton } from '@/components/soul-button';
import { SoulLogo } from '@/components/soul-logo';
import { SoulText } from '@/components/soul-text';
import { getInstallContext, type InstallContext } from '@/services/install-context';
import { createThemedStyles, layout, sizes, spacing, useTheme } from '@/theme';

type Hint = { label: string; href: '/install' | '/download' };

/** In a browser, point people to the right way to keep SOUL on their phone (DECISIONS D-038). */
const INSTALL_HINTS: Record<InstallContext, Hint[]> = {
  'native-app': [],
  'installed-pwa': [],
  'ios-browser': [{ label: 'Add SOUL to your Home Screen', href: '/install' }],
  'android-browser': [{ label: 'Get the Android app', href: '/download' }],
  'other-browser': [
    { label: 'Android', href: '/download' },
    { label: 'iPhone', href: '/install' },
  ],
};

/** Brand moment: the supplied logo on black, the caption, one clear action. */
export function WelcomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const hints = INSTALL_HINTS[getInstallContext()];

  return (
    <View
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
      <StatusBar style="light" />
      <View style={styles.brand}>
        <SoulLogo width={176} on="dark-surface" />
        <SoulText variant="subheading" italic style={{ color: colors.onMoment }}>
          Only for SRM.
        </SoulText>
      </View>
      <View style={styles.actions}>
        <SoulButton
          label="Continue with SRMIST email"
          variant="moment"
          block
          onPress={() => router.push('/rules')}
        />
        <SoulText variant="caption" align="center" style={{ color: colors.onMomentSecondary }}>
          Verified SRMIST students only. 18+.
        </SoulText>
        {hints.length > 0 ? (
          <View style={styles.hints}>
            {hints.map((hint) => (
              <PressableScale
                key={hint.href}
                accessibilityRole="link"
                style={styles.hint}
                onPress={() => router.push(hint.href)}>
                <SoulText
                  variant="supporting"
                  style={[styles.hintLabel, { color: colors.onMoment }]}>
                  {hint.label}
                </SoulText>
              </PressableScale>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.moment,
      paddingHorizontal: layout.screenGutter,
    },
    brand: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
    actions: { gap: spacing.md },
    hints: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
    hint: { minHeight: sizes.touchTarget, justifyContent: 'center', paddingHorizontal: spacing.xs },
    hintLabel: { textDecorationLine: 'underline' },
  }),
);
