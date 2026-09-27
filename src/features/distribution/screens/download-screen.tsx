import { router } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { Skeleton } from '@/components/skeleton';
import { useLatestApk } from '@/features/distribution/api/latest-apk';
import { InstallSteps } from '@/features/distribution/components/install-steps';
import { layout, spacing } from '@/theme';

const STEPS = [
  { text: 'Tap Download. Your browser saves the file.' },
  { text: 'Open the file. If Android asks, allow installs from your browser for SOUL.' },
  { text: 'Open SOUL and sign in with your SRMIST email.' },
];

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** `/download`: the Android APK straight from the SOUL site (DECISIONS D-035, D-038). */
export function DownloadScreen() {
  const latest = useLatestApk();
  const apk = latest.data;

  return (
    <SoulScreen scroll edges={{ top: false, bottom: true }} contentStyle={styles.content}>
      <View style={styles.intro}>
        <SoulText variant="title" accessibilityRole="header">
          SOUL for Android
        </SoulText>
        <SoulText tone="secondary">
          Install SOUL straight from this site. Your account is the same on every phone.
        </SoulText>
      </View>

      {latest.isPending ? (
        <Skeleton height={56} />
      ) : apk ? (
        <View style={styles.download}>
          <SoulButton
            label={`Download SOUL ${apk.version}`}
            icon="download"
            block
            onPress={() => void Linking.openURL(apk.url)}
          />
          <SoulText variant="caption" tone="tertiary" align="center" numeric>
            {megabytes(apk.sizeBytes)} · Android 7 or later
          </SoulText>
        </View>
      ) : (
        <SoulText tone="secondary">
          {latest.isError
            ? "Couldn't check for the latest version. Try again in a moment."
            : "The Android app isn't available to download yet. Check back soon."}
        </SoulText>
      )}

      <InstallSteps steps={STEPS} />

      {apk ? (
        <View style={styles.checksum}>
          <SoulText variant="caption" tone="tertiary">
            To check the file, compare its SHA-256:
          </SoulText>
          <SoulText variant="caption" tone="secondary" numeric selectable>
            {apk.sha256}
          </SoulText>
        </View>
      ) : null}

      <SoulButton
        label="On iPhone? Use SOUL from Safari"
        variant="ghost"
        onPress={() => router.replace('/install')}
      />
    </SoulScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: layout.sectionGap },
  intro: { gap: spacing.sm },
  download: { gap: spacing.sm },
  checksum: { gap: spacing.xxs },
});
