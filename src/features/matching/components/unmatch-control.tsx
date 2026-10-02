import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulText } from '@/components/soul-text';
import { spacing } from '@/theme';

/** The quiet entry point at the end of a match's profile. */
export function UnmatchButton({ onPress }: { onPress: () => void }) {
  return (
    <SoulButton label="Unmatch" variant="ghost" size="md" onPress={onPress} style={styles.start} />
  );
}

type ConfirmProps = { name: string; onCancel: () => void; onUnmatch: () => Promise<void> };

/**
 * The second, explicit step, shown in the screen's pinned footer so it is always in view.
 * No system dialog, so it behaves the same on Android and in the browser. The wording says
 * what happens; nothing is colour-coded.
 */
export function UnmatchConfirm({ name, onCancel, onUnmatch }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onUnmatch();
    } catch {
      setError("Couldn't unmatch. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <View style={styles.confirm} accessibilityLiveRegion="polite">
      <SoulText variant="bodyStrong">Unmatch {name}?</SoulText>
      <SoulText variant="supporting" tone="secondary">
        You won&apos;t see each other again, and this can&apos;t be undone.
      </SoulText>
      {error ? (
        <SoulText variant="supporting" role="alert">
          {error}
        </SoulText>
      ) : null}
      <View style={styles.actions}>
        <SoulButton
          label="Cancel"
          variant="secondary"
          disabled={busy}
          containerStyle={styles.action}
          block
          onPress={onCancel}
        />
        <SoulButton
          label="Unmatch"
          loading={busy}
          containerStyle={styles.action}
          block
          onPress={() => void confirm()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The ghost button's own padding is pulled back so its label sits on the text gutter.
  start: { alignSelf: 'flex-start', marginTop: spacing.xl, marginLeft: -spacing.lg },
  confirm: { gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1 },
});
