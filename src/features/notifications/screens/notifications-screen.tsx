import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulIcon } from '@/components/soul-icon';
import { SoulScreen } from '@/components/soul-screen';
import { SoulSwitch } from '@/components/soul-switch';
import { SoulText } from '@/components/soul-text';
import { ErrorState, LoadingState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import {
  saveNotificationSettings,
  turnOnPush,
  useDevicePush,
  useNotificationSettings,
} from '@/features/notifications/api/notifications';
import {
  KIND_COPY,
  NOTIFICATION_KINDS,
  deviceCopy,
  type NotificationKind,
  type NotificationSettings,
} from '@/features/notifications/model/notifications';
import { getInstallContext } from '@/services/install-context';
import { notifications } from '@/services/notifications';
import { borders, createThemedStyles, radii, spacing } from '@/theme';

/** Settings → Notifications (spec 43, 44): this device, then what to be told about. */
export function NotificationsScreen() {
  const userId = useCurrentUserId();
  const settings = useNotificationSettings(userId);
  if (settings.isPending) return <LoadingState />;
  if (settings.isError || !settings.data || !userId) {
    return (
      <ErrorState
        title="Couldn't load your settings"
        body="Check your connection and try again."
        onRetry={() => void settings.refetch()}
      />
    );
  }
  return <NotificationsForm settings={settings.data} userId={userId} />;
}

function NotificationsForm({
  settings,
  userId,
}: {
  settings: NotificationSettings;
  userId: string;
}) {
  const styles = useStyles();
  const device = useDevicePush();
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permission = device.data?.permission ?? 'undetermined';
  const copy = deviceCopy(
    permission,
    device.data?.registered ?? null,
    getInstallContext() === 'ios-browser',
  );
  const on = permission === 'granted' && device.data?.registered === true;

  async function toggle(kind: NotificationKind, value: boolean) {
    setSaving(true);
    setError(null);
    try {
      await saveNotificationSettings(userId, { ...settings, [kind]: value });
    } catch {
      setError("Couldn't save that. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function turnOn() {
    setAsking(true);
    try {
      await turnOnPush(userId);
    } finally {
      setAsking(false);
    }
  }

  return (
    <SoulScreen scroll edges={{ top: false, bottom: true }}>
      <SoulText variant="title" accessibilityRole="header">
        Notifications
      </SoulText>

      <View style={styles.device}>
        <SoulIcon name={on ? 'notifications' : 'notifications_off'} size="md" color="textPrimary" />
        <View style={styles.text}>
          <SoulText variant="bodyStrong">{device.isPending ? 'Checking…' : copy.title}</SoulText>
          {device.isPending ? null : (
            <SoulText variant="supporting" tone="secondary">
              {copy.body}
            </SoulText>
          )}
          {permission === 'undetermined' && !device.isPending ? (
            <SoulButton
              label="Turn on notifications"
              size="sm"
              loading={asking}
              onPress={() => void turnOn()}
              style={styles.action}
            />
          ) : null}
          {permission === 'denied' && notifications.canOpenSettings ? (
            <SoulButton
              label="Open settings"
              size="sm"
              variant="secondary"
              onPress={() => void notifications.openSettings()}
              style={styles.action}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <SoulText variant="label" tone="secondary">
          Tell me about
        </SoulText>
        {NOTIFICATION_KINDS.map((kind) => (
          <View key={kind} style={styles.switchRow}>
            <View style={styles.text}>
              <SoulText variant="bodyStrong">{KIND_COPY[kind].title}</SoulText>
              <SoulText variant="supporting" tone="secondary">
                {KIND_COPY[kind].body}
              </SoulText>
            </View>
            <SoulSwitch
              value={settings[kind]}
              disabled={saving}
              onValueChange={(value) => void toggle(kind, value)}
              accessibilityLabel={KIND_COPY[kind].title}
            />
          </View>
        ))}
        <SoulText variant="supporting" tone="tertiary" style={styles.note}>
          SOUL only notifies you about something that happened. No reminders, no &quot;come
          back&quot; messages. On a locked phone the text stays hidden.
        </SoulText>
      </View>

      {error ? (
        <SoulText variant="supporting" tone="secondary" accessibilityRole="alert">
          {error}
        </SoulText>
      ) : null}
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    device: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: borders.hairline,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    text: { flex: 1, gap: spacing.xs },
    action: { alignSelf: 'flex-start', marginTop: spacing.sm },
    section: { marginTop: spacing.xl, gap: spacing.md },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    note: { marginTop: spacing.xs },
  }),
);
