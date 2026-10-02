import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulIcon } from '@/components/soul-icon';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { ErrorState, LoadingState } from '@/components/states';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { updateProfileFields, useMyProfile } from '@/features/profile/api/profile';
import { zodiacLabel, type MyProfile, type PrivacyMode } from '@/features/profile/model/profile';
import { borders, createThemedStyles, radii, spacing, useTheme } from '@/theme';

const MODES: { mode: PrivacyMode; title: string; body: string }[] = [
  {
    mode: 'normal',
    title: 'Visible',
    body: 'Students who match your preferences can see you in Discover.',
  },
  {
    mode: 'private',
    title: 'Private',
    body: 'Hidden from Discover. People you have matched with can still see you and chat.',
  },
  {
    mode: 'anonymous',
    title: 'Anonymous',
    body: 'Shown with blurred photos and no name. Your age, verified badge, hook, About Me and zodiac (if on) still show.',
  },
];

/** Profile visibility and zodiac visibility (spec 20, 17). */
export function PrivacyScreen() {
  const userId = useCurrentUserId();
  const profile = useMyProfile(userId);
  if (profile.isPending) return <LoadingState />;
  if (profile.isError || !profile.data || !userId) {
    return (
      <ErrorState
        title="Couldn't load your settings"
        body="Check your connection and try again."
        onRetry={() => void profile.refetch()}
      />
    );
  }
  return <PrivacyForm profile={profile.data} userId={userId} />;
}

function PrivacyForm({ profile, userId }: { profile: MyProfile; userId: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(fields: Parameters<typeof updateProfileFields>[1]) {
    setSaving(true);
    setError(null);
    try {
      await updateProfileFields(userId, fields);
    } catch {
      setError("Couldn't save that. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SoulScreen scroll edges={{ top: false, bottom: true }}>
      <SoulText variant="title" accessibilityRole="header">
        Privacy
      </SoulText>

      <View style={styles.section} role="radiogroup" aria-label="Profile visibility">
        <SoulText variant="label" tone="secondary">
          Who can see you
        </SoulText>
        {MODES.map(({ mode, title, body }) => {
          const selected = profile.privacy_mode === mode;
          return (
            <PressableScale
              key={mode}
              role="radio"
              aria-checked={selected}
              aria-disabled={saving}
              accessibilityLabel={title}
              accessibilityHint={body}
              disabled={saving}
              scale={false}
              onPress={() => void save({ privacy_mode: mode })}
              style={[styles.option, selected && styles.optionSelected]}>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? (
                  <SoulIcon name="check" size="sm" color="inverseText" weight="regular" />
                ) : null}
              </View>
              <View style={styles.optionText}>
                <SoulText variant="bodyStrong">{title}</SoulText>
                <SoulText variant="supporting" tone="secondary">
                  {body}
                </SoulText>
              </View>
            </PressableScale>
          );
        })}
      </View>

      {profile.privacy_mode === 'anonymous' ? (
        <View style={styles.section}>
          <SoulText variant="label" tone="secondary">
            After a match
          </SoulText>
          <View style={styles.switchRow}>
            <View style={styles.optionText}>
              <SoulText variant="bodyStrong">Show my name and photos to matches</SoulText>
              <SoulText variant="supporting" tone="secondary">
                Only people you match with see them. Everyone else still sees you blurred.
              </SoulText>
            </View>
            <Switch
              value={profile.reveal_on_match}
              disabled={saving}
              onValueChange={(value) => void save({ reveal_on_match: value })}
              trackColor={{ false: colors.border, true: colors.inverseSurface }}
              thumbColor={colors.background}
              accessibilityLabel="Show my name and photos to matches"
            />
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <SoulText variant="label" tone="secondary">
          Chats
        </SoulText>
        <View style={styles.switchRow}>
          <View style={styles.optionText}>
            <SoulText variant="bodyStrong">Read receipts</SoulText>
            <SoulText variant="supporting" tone="secondary">
              Matches see when you have read their messages. If you turn this off, you won&apos;t
              see when they have read yours either.
            </SoulText>
          </View>
          <Switch
            value={profile.read_receipts}
            disabled={saving}
            onValueChange={(value) => void save({ read_receipts: value })}
            trackColor={{ false: colors.border, true: colors.inverseSurface }}
            thumbColor={colors.background}
            accessibilityLabel="Read receipts"
          />
        </View>
      </View>

      <View style={styles.section}>
        <SoulText variant="label" tone="secondary">
          Zodiac
        </SoulText>
        <View style={styles.switchRow}>
          <View style={styles.optionText}>
            <SoulText variant="bodyStrong">
              Show my zodiac{profile.zodiac ? ` (${zodiacLabel(profile.zodiac)})` : ''}
            </SoulText>
            <SoulText variant="supporting" tone="secondary">
              Worked out from your birthday. Your birthday itself always stays private.
            </SoulText>
          </View>
          <Switch
            value={profile.zodiac_visible}
            disabled={saving}
            onValueChange={(value) => void save({ zodiac_visible: value })}
            trackColor={{ false: colors.border, true: colors.inverseSurface }}
            thumbColor={colors.background}
            accessibilityLabel="Show my zodiac"
          />
        </View>
      </View>

      {error ? (
        <SoulText variant="supporting" role="alert">
          {error}
        </SoulText>
      ) : null}
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    section: { gap: spacing.sm, marginTop: spacing.xl },
    option: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: borders.hairline,
      borderColor: colors.border,
    },
    optionSelected: { borderColor: colors.borderStrong, borderWidth: borders.strong },
    radio: {
      width: 24,
      height: 24,
      marginTop: spacing.xxs / 2,
      borderRadius: radii.full,
      borderWidth: borders.strong,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: { backgroundColor: colors.inverseSurface },
    optionText: { flex: 1, gap: spacing.xxs },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  }),
);
