import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { EmptyState, LoadingState } from '@/components/states';
import { resolveReport, setAccountState, useModerationQueue } from '@/features/admin/api/admin';
import {
  AdminCard,
  AdminSection,
  ButtonRow,
  Fact,
  Nothing,
} from '@/features/admin/components/admin-parts';
import { suspendUntil, type QueuedReport } from '@/features/admin/model/admin';
import { REPORT_LABEL, type ReportCategory } from '@/features/safety/model/safety';
import { shortDate } from '@/features/swipes/model/swipes';
import { borders, createThemedStyles, radii, spacing } from '@/theme';

/** The reason recorded with a suspension or ban, from what was reported. */
function reasonFor(category: ReportCategory): string {
  if (category === 'fake_account' || category === 'impersonation') return 'fake_account';
  if (category === 'underage') return 'underage';
  if (category === 'threat' || category === 'stalking') return 'safety';
  return 'community_rules';
}

function back() {
  if (router.canGoBack()) router.back();
  else router.replace('/admin');
}

/** One open report: what was said, the evidence, and the decision. */
export function AdminReportScreen({ id }: { id: string }) {
  const queue = useModerationQueue();
  if (queue.isPending) return <LoadingState />;
  const report = queue.data?.reports.find((item) => item.id === id);
  if (!report) {
    return (
      <EmptyState
        icon="check"
        title="This report is closed"
        body="Someone already decided it, or it no longer exists."
        action={{ label: 'Back', onPress: back }}
      />
    );
  }
  return <ReportDetail report={report} />;
}

function ReportDetail({ report }: { report: QueuedReport }) {
  const styles = useStyles();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messages = report.evidence.messages ?? [];
  const reason = reasonFor(report.category);

  async function decide(key: string, run: () => Promise<{ ok: boolean }>) {
    setBusy(key);
    setError(null);
    try {
      const outcome = await run();
      if (outcome.ok) back();
      else setError("That didn't go through. The account may have changed; reload and try again.");
    } catch {
      setError("Couldn't save that. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const restrict = (key: string, state: 'suspended' | 'banned', until: string | null) =>
    decide(key, async () => {
      const changed = await setAccountState(report.reported_id!, state, reason, until);
      if (!changed.ok) return changed;
      return resolveReport(report.id, true, state === 'banned' ? 'Banned' : 'Suspended');
    });

  return (
    <SoulScreen scroll edges={{ top: false, bottom: true }}>
      <SoulText variant="title" accessibilityRole="header">
        {report.priority ? 'Urgent: ' : ''}
        {REPORT_LABEL[report.category]}
      </SoulText>

      <AdminSection title="Report">
        <Fact label="Received" value={shortDate(report.created_at)} />
        <Fact label="From" value={report.context} />
        <Fact label="About them so far" value={`${report.reports_against} report(s)`} />
        <Fact label="Details" value={report.details?.trim() || 'None given'} />
        {report.reported_deleted ? (
          <SoulText variant="supporting" tone="secondary">
            They have deleted their account. The report stays for safety records.
          </SoulText>
        ) : (
          <SoulButton
            label="Open their account"
            size="sm"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/admin/account/[id]', params: { id: report.reported_id! } })
            }
            style={styles.alignStart}
          />
        )}
      </AdminSection>

      <AdminSection title="Recent messages between them" count={messages.length}>
        {messages.length === 0 ? <Nothing text="No messages were attached." /> : null}
        {messages.map((message, index) => (
          <View
            key={`${message.at}-${index}`}
            style={[styles.message, message.from === 'reported' && styles.reported]}>
            <SoulText variant="caption" tone="secondary">
              {message.from === 'reported' ? 'Reported person' : 'Reporter'} ·{' '}
              {shortDate(message.at)}
            </SoulText>
            <SoulText variant="body" selectable>
              {message.body}
            </SoulText>
          </View>
        ))}
      </AdminSection>

      <AdminSection title="Decision">
        <AdminCard>
          {report.reported_deleted ? null : (
            <ButtonRow>
              <SoulButton
                label="Suspend 7 days"
                size="sm"
                variant="secondary"
                loading={busy === 'suspend'}
                onPress={() => void restrict('suspend', 'suspended', suspendUntil(7))}
              />
              {confirmBan ? (
                <SoulButton
                  label="Confirm ban"
                  size="sm"
                  loading={busy === 'ban'}
                  onPress={() => void restrict('ban', 'banned', null)}
                />
              ) : (
                <SoulButton
                  label="Ban"
                  size="sm"
                  variant="secondary"
                  onPress={() => setConfirmBan(true)}
                />
              )}
            </ButtonRow>
          )}
          <SoulButton
            label="No action needed"
            size="sm"
            variant="ghost"
            loading={busy === 'dismiss'}
            onPress={() =>
              void decide('dismiss', () => resolveReport(report.id, false, 'No action'))
            }
            style={styles.alignStart}
          />
          {error ? (
            <SoulText variant="supporting" tone="secondary" accessibilityRole="alert">
              {error}
            </SoulText>
          ) : null}
        </AdminCard>
      </AdminSection>
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(({ colors }) =>
  StyleSheet.create({
    alignStart: { alignSelf: 'flex-start' },
    message: {
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radii.md,
      borderWidth: borders.hairline,
      borderColor: colors.border,
    },
    reported: { backgroundColor: colors.surfaceSubtle },
  }),
);
