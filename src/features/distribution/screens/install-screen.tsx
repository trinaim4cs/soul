import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { InstallSteps } from '@/features/distribution/components/install-steps';
import { getInstallContext } from '@/services/install-context';
import { layout, spacing } from '@/theme';

const STEPS = [
  { text: 'Open this page in Safari.' },
  { text: 'Tap Share.', icon: 'ios_share' as const },
  { text: 'Tap Add to Home Screen.', icon: 'add_box' as const },
  { text: 'Open SOUL from your Home Screen and sign in with your SRMIST email.' },
];

/** `/install`: SOUL on iPhone as a Home Screen app (PWA), no App Store (DECISIONS D-035). */
export function InstallScreen() {
  const installed = getInstallContext() === 'installed-pwa';

  return (
    <SoulScreen scroll edges={{ top: false, bottom: true }} contentStyle={styles.content}>
      <View style={styles.intro}>
        <SoulText variant="title" accessibilityRole="header">
          SOUL on iPhone
        </SoulText>
        <SoulText tone="secondary">
          {installed
            ? 'SOUL is on your Home Screen. You are all set.'
            : 'Add SOUL to your Home Screen. It opens full screen, like any other app, with no App Store needed.'}
        </SoulText>
      </View>

      {installed ? (
        <SoulButton label="Open SOUL" block onPress={() => router.replace('/')} />
      ) : (
        <>
          <InstallSteps steps={STEPS} />
          <SoulText variant="supporting" tone="tertiary">
            SOUL also works in a Safari tab, but notifications need the Home Screen version.
          </SoulText>
        </>
      )}

      <SoulButton
        label="Using Android? Get the app"
        variant="ghost"
        onPress={() => router.replace('/download')}
      />
    </SoulScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: layout.sectionGap },
  intro: { gap: spacing.sm },
});
