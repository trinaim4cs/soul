import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SoulButton } from '@/components/soul-button';
import { SoulIcon } from '@/components/soul-icon';
import { SoulInput } from '@/components/soul-input';
import { SoulPhoto } from '@/components/soul-photo';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { ErrorState, LoadingState } from '@/components/states';
import {
  decideAppeal,
  findAccount,
  reviewDateFlag,
  reviewPhoto,
  useModerationQueue,
} from '@/features/admin/api/admin';
import {
  AdminCard,
  AdminSection,
  ButtonRow,
  Nothing,
} from '@/features/admin/components/admin-parts';
import {
  REASON_LABEL,
  STATE_LABEL,
  type AdminRole,
  type ModerationQueue,
} from '@/features/admin/model/admin';
import { SettingsRow } from '@/features/settings/components/settings-row';
import { PHOTO_BUCKET, usePhotoUrls } from '@/features/profile/api/profile';
import { REPORT_LABEL } from '@/features/safety/model/safety';
import { shortDate } from '@/features/swipes/model/swipes';
import { createThemedStyles, spacing } from '@/theme';

const DATE_FLAG_LABEL: Record<string, string> = {
  same_pair_repeated: 'The same two people, again and again',
  high_volume: 'Unusually many dates',
};

const openAccount = (id: string) =>
  router.push({ pathname: '/admin/account/[id]', params: { id } });

/** Admin (spec 45, D-055): what is waiting, an exact account lookup, and admin-only tools. */
export function AdminHomeScreen({ role }: { role: AdminRole }) {
  const queue = useModerationQueue();
  if (queue.isPending) return <LoadingState />;
  if (queue.isError || !queue.data) {
    return (
      <ErrorState
        title="Couldn't load the queue"
        body="Check your connection and try again."
        onRetry={() => void queue.refetch()}
      />
    );
  }
  return <AdminHome role={role} queue={queue.data} refreshing={queue.isRefetching} />;
}

function AdminHome({
  role,
  queue,
}: {
  role: AdminRole;
  queue: ModerationQueue;
  refreshing: boolean;
}) {
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const photoUrls = usePhotoUrls(
    PHOTO_BUCKET,
    queue.photos.map((photo) => photo.path),
  );

  async function lookUp() {
    setLookupError(null);
    try {
      const id = await findAccount(query);
      if (id) openAccount(id);
      else setLookupError('No account with that email or id.');
    } catch {
      setLookupError("Couldn't look that up. Try again.");
    }
  }

  async function act(key: string, run: () => Promise<unknown>) {
    setBusy(key);
    try {
      await run();
    } finally {
      setBusy(null);
    }
  }

  return (
    <SoulScreen scroll edges={{ top: false, bottom: true }}>
      <SoulText variant="title" accessibilityRole="header">
        Admin
      </SoulText>
      <SoulText variant="supporting" tone="secondary">
        Signed in as {role === 'admin' ? 'an admin' : 'a moderator'}. Every action is logged.
      </SoulText>

      <AdminSection title="Find an account">
        <SoulInput
          label="Exact email or account id"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          error={lookupError ?? undefined}
          onSubmitEditing={() => void lookUp()}
        />
        <SoulButton
          label="Open"
          size="sm"
          variant="secondary"
          disabled={query.trim().length < 3}
          onPress={() => void lookUp()}
          style={styles.alignStart}
        />
      </AdminSection>

      <AdminSection title="Reports" count={queue.reports.length}>
        {queue.reports.length === 0 ? <Nothing /> : null}
        {queue.reports.map((report) => (
          <PressableScale
            key={report.id}
            accessibilityRole="button"
            accessibilityLabel={`${REPORT_LABEL[report.category]} report`}
            scale={false}
            onPress={() =>
              router.push({ pathname: '/admin/report/[id]', params: { id: report.id } })
            }>
            <AdminCard>
              <View style={styles.row}>
                <View style={styles.grow}>
                  <SoulText variant="bodyStrong">
                    {report.priority ? 'Urgent · ' : ''}
                    {REPORT_LABEL[report.category]}
                  </SoulText>
                  <SoulText variant="supporting" tone="secondary">
                    {shortDate(report.created_at)} · from {report.context} ·{' '}
                    {report.reports_against === 1
                      ? 'first report about them'
                      : `${report.reports_against} reports about them`}
                  </SoulText>
                </View>
                <SoulIcon name="chevron_right" size="md" color="textSecondary" />
              </View>
            </AdminCard>
          </PressableScale>
        ))}
      </AdminSection>

      <AdminSection title="Photos to review" count={queue.photos.length}>
        {queue.photos.length === 0 ? <Nothing /> : null}
        {queue.photos.map((photo) => (
          <AdminCard key={photo.id}>
            <View style={styles.row}>
              <SoulPhoto
                source={photoUrls.data?.[photo.path] ? { uri: photoUrls.data[photo.path] } : null}
                style={styles.thumb}
                accessibilityLabel="Photo waiting for review"
              />
              <View style={[styles.grow, styles.gap]}>
                <SoulText variant="supporting" tone="secondary">
                  Added {shortDate(photo.created_at)}
                </SoulText>
                <ButtonRow>
                  <SoulButton
                    label="Approve"
                    size="sm"
                    loading={busy === `approve:${photo.id}`}
                    onPress={() =>
                      void act(`approve:${photo.id}`, () => reviewPhoto(photo.id, true))
                    }
                  />
                  <SoulButton
                    label="Reject"
                    size="sm"
                    variant="secondary"
                    loading={busy === `reject:${photo.id}`}
                    onPress={() =>
                      void act(`reject:${photo.id}`, () => reviewPhoto(photo.id, false))
                    }
                  />
                  <SoulButton
                    label="Account"
                    size="sm"
                    variant="ghost"
                    onPress={() => openAccount(photo.user_id)}
                  />
                </ButtonRow>
              </View>
            </View>
          </AdminCard>
        ))}
      </AdminSection>

      <AdminSection title="Appeals" count={queue.appeals.length}>
        {queue.appeals.length === 0 ? <Nothing /> : null}
        {queue.appeals.map((appeal) => (
          <AdminCard key={appeal.id}>
            <SoulText variant="supporting" tone="secondary">
              {STATE_LABEL[appeal.account_state as keyof typeof STATE_LABEL] ??
                appeal.account_state}
              {appeal.restriction_reason
                ? ` · ${REASON_LABEL[appeal.restriction_reason] ?? appeal.restriction_reason}`
                : ''}{' '}
              · {shortDate(appeal.created_at)}
            </SoulText>
            <SoulText variant="body" selectable>
              {appeal.message}
            </SoulText>
            <ButtonRow>
              <SoulButton
                label="Restore"
                size="sm"
                loading={busy === `restore:${appeal.id}`}
                onPress={() =>
                  void act(`restore:${appeal.id}`, () =>
                    decideAppeal(appeal.id, true, 'Restored on appeal'),
                  )
                }
              />
              <SoulButton
                label="Keep decision"
                size="sm"
                variant="secondary"
                loading={busy === `keep:${appeal.id}`}
                onPress={() =>
                  void act(`keep:${appeal.id}`, () =>
                    decideAppeal(appeal.id, false, 'Decision kept on appeal'),
                  )
                }
              />
              {appeal.user_id ? (
                <SoulButton
                  label="Account"
                  size="sm"
                  variant="ghost"
                  onPress={() => openAccount(appeal.user_id!)}
                />
              ) : null}
            </ButtonRow>
          </AdminCard>
        ))}
      </AdminSection>

      <AdminSection title="Dates to review" count={queue.date_flags.length}>
        {queue.date_flags.length === 0 ? <Nothing /> : null}
        {queue.date_flags.map((flag) => (
          <AdminCard key={flag.id}>
            <SoulText variant="bodyStrong">{DATE_FLAG_LABEL[flag.reason] ?? flag.reason}</SoulText>
            <SoulText variant="supporting" tone="secondary">
              Flagged {shortDate(flag.created_at)}
              {flag.invalidated ? ' · already voided' : ''}
            </SoulText>
            <ButtonRow>
              <SoulButton
                label="Void date"
                size="sm"
                variant="secondary"
                loading={busy === `void:${flag.id}`}
                onPress={() =>
                  void act(`void:${flag.id}`, () =>
                    reviewDateFlag(flag.id, true, 'Voided on review'),
                  )
                }
              />
              <SoulButton
                label="Looks fine"
                size="sm"
                variant="secondary"
                loading={busy === `keep:${flag.id}`}
                onPress={() =>
                  void act(`keep:${flag.id}`, () =>
                    reviewDateFlag(flag.id, false, 'Cleared on review'),
                  )
                }
              />
              <SoulButton
                label="Person A"
                size="sm"
                variant="ghost"
                onPress={() => openAccount(flag.user_a)}
              />
              <SoulButton
                label="Person B"
                size="sm"
                variant="ghost"
                onPress={() => openAccount(flag.user_b)}
              />
            </ButtonRow>
          </AdminCard>
        ))}
      </AdminSection>

      {role === 'admin' ? (
        <AdminSection title="Configuration">
          <View>
            <SettingsRow
              icon="favorite"
              label="Plans"
              detail="Prices, likes, on sale"
              onPress={() => router.push('/admin/plans')}
            />
            <SettingsRow
              icon="tune"
              label="Feature flags"
              detail="Payments, Instant Meet, photo review, badge"
              onPress={() => router.push('/admin/flags')}
            />
          </View>
        </AdminSection>
      ) : null}
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(() =>
  StyleSheet.create({
    alignStart: { alignSelf: 'flex-start' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    grow: { flex: 1 },
    gap: { gap: spacing.sm },
    thumb: { width: 72, height: 90 },
  }),
);
