import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulChip } from '@/components/soul-chip';
import { SoulInput } from '@/components/soul-input';
import { SoulPhoto } from '@/components/soul-photo';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import {
  grantLikes,
  grantPlan,
  setAccountState,
  useAdminAccount,
  useAdminPlans,
} from '@/features/admin/api/admin';
import {
  AdminCard,
  AdminSection,
  ButtonRow,
  Fact,
  Nothing,
} from '@/features/admin/components/admin-parts';
import {
  ACTION_LABEL,
  REASON_LABEL,
  STATE_LABEL,
  SUSPENSIONS,
  suspendUntil,
  type AdminAccount,
  type AdminRole,
} from '@/features/admin/model/admin';
import { PHOTO_BUCKET, usePhotoUrls } from '@/features/profile/api/profile';
import { shortDate } from '@/features/swipes/model/swipes';
import { createThemedStyles, spacing } from '@/theme';

const day = (iso: string | null) => (iso ? shortDate(iso) : 'No');

/** One account's operational facts and the actions on it (D-055). Opening it is logged. */
export function AdminAccountScreen({ id, role }: { id: string; role: AdminRole }) {
  const account = useAdminAccount(id);
  if (account.isPending) return <LoadingState />;
  if (account.isError) {
    return (
      <ErrorState
        title="Couldn't load this account"
        body="Check your connection and try again."
        onRetry={() => void account.refetch()}
      />
    );
  }
  if (!account.data) {
    return <EmptyState icon="person" title="No such account" body="It may have been deleted." />;
  }
  return <AccountDetail account={account.data} role={role} />;
}

function AccountDetail({ account, role }: { account: AdminAccount; role: AdminRole }) {
  const styles = useStyles();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const photos = usePhotoUrls(
    PHOTO_BUCKET,
    account.photos.map((photo) => photo.path),
  );
  const restricted = account.account_state === 'suspended' || account.account_state === 'banned';

  async function act(key: string, run: () => Promise<{ ok: boolean; reason?: string }>) {
    setBusy(key);
    setMessage(null);
    try {
      const outcome = await run();
      setMessage(outcome.ok ? 'Done.' : `Not done (${outcome.reason ?? 'refused'}).`);
    } catch {
      setMessage("Couldn't save that. Check your connection and try again.");
    } finally {
      setBusy(null);
      setConfirmBan(false);
    }
  }

  return (
    <SoulScreen scroll edges={{ top: false, bottom: true }}>
      <SoulText variant="title" accessibilityRole="header">
        {account.profile?.name || 'Account'}
      </SoulText>
      <SoulText variant="supporting" tone="secondary" selectable>
        {account.email ?? 'No email'}
        {account.role ? ` · ${account.role}` : ''}
      </SoulText>

      <AdminSection title="Status">
        <Fact
          label="State"
          value={`${STATE_LABEL[account.account_state]}${
            account.restricted_until ? ` until ${shortDate(account.restricted_until)}` : ''
          }${
            account.restriction_reason
              ? ` (${REASON_LABEL[account.restriction_reason] ?? account.restriction_reason})`
              : ''
          }`}
        />
        <Fact label="Joined" value={shortDate(account.created_at)} />
        <Fact label="SRMIST code confirmed" value={day(account.email_verified_at)} />
        <Fact
          label="Age (self-declared)"
          value={account.age === null ? 'Not given' : String(account.age)}
        />
        {account.age_check_failed_at ? (
          <Fact label="Age check failed" value={shortDate(account.age_check_failed_at)} />
        ) : null}
        <Fact label="Rules version" value={account.terms_version ?? 'None'} />
        <Fact label="Profile" value={account.profile?.privacy_mode ?? 'Not started'} />
        <Fact
          label="Reports"
          value={`${account.reports_against} about them (${account.open_reports_against} open) · ${account.reports_made} made`}
        />
        <Fact
          label="Likes and plans"
          value={`${account.likes_left} likes left · ${
            account.plans
              .map((plan) => `${plan.plan_id} to ${shortDate(plan.ends_at)}`)
              .join(', ') || 'no plan'
          } · ${account.payments} payment(s)`}
        />
        <Fact
          label="Dates"
          value={`${account.counted_dates} counted${account.hot_person ? ' · has the badge' : ''}${
            account.open_date_flags ? ` · ${account.open_date_flags} flagged` : ''
          }`}
        />
        <Fact label="Devices for push" value={String(account.devices)} />
      </AdminSection>

      <AdminSection title="Photos" count={account.photos.length}>
        {account.photos.length === 0 ? <Nothing text="No photos." /> : null}
        <View style={styles.photos}>
          {account.photos.map((photo) => (
            <View key={photo.id} style={styles.photo}>
              <SoulPhoto
                source={photos.data?.[photo.path] ? { uri: photos.data[photo.path] } : null}
                accessibilityLabel={`Photo ${photo.position + 1}, ${photo.status}`}
              />
              <SoulText variant="caption" tone="secondary">
                {photo.status}
              </SoulText>
            </View>
          ))}
        </View>
      </AdminSection>

      <AdminSection title="Actions">
        <AdminCard>
          {account.role && role !== 'admin' ? (
            <SoulText variant="supporting" tone="secondary">
              Only an admin can act on another moderator.
            </SoulText>
          ) : (
            <ButtonRow>
              {SUSPENSIONS.map(({ label, days }) => (
                <SoulButton
                  key={days}
                  label={label}
                  size="sm"
                  variant="secondary"
                  loading={busy === `suspend:${days}`}
                  onPress={() =>
                    void act(`suspend:${days}`, () =>
                      setAccountState(
                        account.id,
                        'suspended',
                        'community_rules',
                        suspendUntil(days),
                      ),
                    )
                  }
                />
              ))}
              {confirmBan ? (
                <SoulButton
                  label="Confirm ban"
                  size="sm"
                  loading={busy === 'ban'}
                  onPress={() =>
                    void act('ban', () =>
                      setAccountState(account.id, 'banned', 'community_rules', null),
                    )
                  }
                />
              ) : (
                <SoulButton
                  label="Ban"
                  size="sm"
                  variant="secondary"
                  onPress={() => setConfirmBan(true)}
                />
              )}
              {restricted ? (
                <SoulButton
                  label="Restore"
                  size="sm"
                  loading={busy === 'restore'}
                  onPress={() =>
                    void act('restore', () => setAccountState(account.id, 'active', null, null))
                  }
                />
              ) : null}
            </ButtonRow>
          )}
          {message ? (
            <SoulText variant="supporting" tone="secondary" accessibilityRole="alert">
              {message}
            </SoulText>
          ) : null}
        </AdminCard>
      </AdminSection>

      {role === 'admin' ? <SupportGrants accountId={account.id} /> : null}

      <AdminSection title="History" count={account.history.length}>
        {account.history.length === 0 ? <Nothing text="No actions yet." /> : null}
        {account.history.map((item, index) => (
          <Fact
            key={`${item.created_at}-${index}`}
            label={shortDate(item.created_at)}
            value={`${ACTION_LABEL[item.action] ?? item.action}${item.reason ? ` · ${item.reason}` : ''}`}
          />
        ))}
      </AdminSection>

      <AdminSection title="Appeals" count={account.appeals.length}>
        {account.appeals.length === 0 ? <Nothing text="None." /> : null}
        {account.appeals.map((appeal, index) => (
          <Fact
            key={`${appeal.created_at}-${index}`}
            label={`${shortDate(appeal.created_at)} · ${appeal.status}`}
            value={appeal.message}
          />
        ))}
      </AdminSection>
    </SoulScreen>
  );
}

/** Admins only: likes or a plan for a support case, always with a reason. */
function SupportGrants({ accountId }: { accountId: string }) {
  const styles = useStyles();
  const plans = useAdminPlans();
  const [reason, setReason] = useState('');
  const [plan, setPlan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ready = reason.trim().length >= 3;

  async function run(work: () => Promise<{ ok: boolean; reason?: string }>) {
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await work();
      setMessage(outcome.ok ? 'Granted.' : `Not granted (${outcome.reason ?? 'refused'}).`);
      if (outcome.ok) setReason('');
    } catch {
      setMessage("Couldn't save that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminSection title="Support">
      <AdminCard>
        <SoulInput
          label="Reason (kept in the log)"
          value={reason}
          onChangeText={(text) => setReason(text.slice(0, 200))}
          maxLength={200}
        />
        <ButtonRow>
          <SoulButton
            label="Give 5 likes"
            size="sm"
            variant="secondary"
            disabled={!ready || busy}
            onPress={() => void run(() => grantLikes(accountId, 5, reason))}
          />
        </ButtonRow>
        <View style={styles.chips}>
          {(plans.data ?? [])
            .filter((item) => item.active)
            .map((item) => (
              <SoulChip
                key={item.id}
                label={item.title}
                selected={plan === item.id}
                onPress={() => setPlan(item.id)}
              />
            ))}
        </View>
        <SoulButton
          label="Grant this plan"
          size="sm"
          variant="secondary"
          disabled={!ready || !plan || busy}
          onPress={() => void run(() => grantPlan(accountId, plan!, reason))}
          style={styles.alignStart}
        />
        {message ? (
          <SoulText variant="supporting" tone="secondary" accessibilityRole="alert">
            {message}
          </SoulText>
        ) : null}
      </AdminCard>
    </AdminSection>
  );
}

const useStyles = createThemedStyles(() =>
  StyleSheet.create({
    photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    photo: { width: 96, gap: spacing.xs },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    alignStart: { alignSelf: 'flex-start' },
  }),
);
