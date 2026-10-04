import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/skeleton';
import { SoulButton } from '@/components/soul-button';
import { SoulIcon, type IconName } from '@/components/soul-icon';
import { SoulText } from '@/components/soul-text';
import { layout, radii, spacing } from '@/theme';

type Action = { label: string; onPress: () => void };

type StateProps = {
  title: string;
  body?: string;
  icon?: IconName;
  /** Optional brand or illustration moment above the copy (e.g. SoulLogo on branded empties). */
  visual?: ReactNode;
  action?: Action;
  secondaryAction?: Action;
};

/**
 * Composed state for empty, error, offline, permission and session states. Centered is
 * correct here (these are interstitials); copy says what happened and what to do next.
 */
function StateView({ title, body, icon, visual, action, secondaryAction }: StateProps) {
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      {visual ?? (icon ? <SoulIcon name={icon} size="xl" color="textSecondary" /> : null)}
      <View style={styles.copy}>
        {/* Centred text spans the column: shrink-wrapped centred text can lose its last line
            on Android when the measured width rounds down (the same fix as chat and Instant). */}
        <SoulText
          variant="subheading"
          align="center"
          accessibilityRole="header"
          style={styles.stretch}>
          {title}
        </SoulText>
        {body ? (
          <SoulText tone="secondary" align="center" style={styles.stretch}>
            {body}
          </SoulText>
        ) : null}
      </View>
      {action || secondaryAction ? (
        <View style={styles.actions}>
          {action ? <SoulButton label={action.label} onPress={action.onPress} size="md" /> : null}
          {secondaryAction ? (
            <SoulButton
              label={secondaryAction.label}
              onPress={secondaryAction.onPress}
              variant="ghost"
              size="md"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function EmptyState(props: StateProps) {
  return <StateView {...props} />;
}

export function ErrorState({
  title = 'Something went wrong',
  body = 'Check your connection and try again.',
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry: () => void;
}) {
  return (
    <StateView
      icon="error"
      title={title}
      body={body}
      action={{ label: 'Try again', onPress: onRetry }}
    />
  );
}

export function OfflineState({ onRetry }: { onRetry: () => void }) {
  return (
    <StateView
      icon="wifi_off"
      title="You're offline"
      body="SOUL will catch up as soon as you're back online."
      action={{ label: 'Try again', onPress: onRetry }}
    />
  );
}

export function PermissionState({
  icon,
  title,
  body,
  onAllow,
  onOpenSettings,
  allowLabel = 'Allow',
}: {
  icon: IconName;
  title: string;
  body: string;
  onAllow?: () => void;
  onOpenSettings?: () => void;
  allowLabel?: string;
}) {
  return (
    <StateView
      icon={icon}
      title={title}
      body={body}
      action={onAllow ? { label: allowLabel, onPress: onAllow } : undefined}
      secondaryAction={
        onOpenSettings ? { label: 'Open settings', onPress: onOpenSettings } : undefined
      }
    />
  );
}

/** Profile-shaped loading skeleton: a photo block and two text lines. */
export function LoadingState() {
  return (
    <View style={styles.loading} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <Skeleton height={420} radius={radii.lg} />
      <Skeleton height={28} width="55%" />
      <Skeleton height={18} width="80%" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.xxl,
  },
  copy: { gap: spacing.xs, maxWidth: layout.maxTextWidth, alignSelf: 'stretch' },
  stretch: { alignSelf: 'stretch' },
  actions: { alignItems: 'center', gap: spacing.xs },
  loading: { gap: spacing.md, paddingHorizontal: layout.screenGutter },
});
