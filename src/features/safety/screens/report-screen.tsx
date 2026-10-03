import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulCheckbox } from '@/components/soul-checkbox';
import { SoulChip } from '@/components/soul-chip';
import { SoulInput } from '@/components/soul-input';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { refreshAfterBlock, reportUser } from '@/features/safety/api/safety';
import {
  MAX_REPORT_DETAILS,
  REPORT_CATEGORIES,
  REPORT_LABEL,
  type ReportCategory,
  type SafetyContext,
} from '@/features/safety/model/safety';
import { createThemedStyles, spacing } from '@/theme';

type Props = { personId: string; name: string; context: SafetyContext };

function done(blocked: boolean, context: SafetyContext) {
  if (!blocked) {
    if (router.canGoBack()) router.back();
    else router.replace('/');
    return;
  }
  // Blocked too: everything about them is gone, so leave their screens entirely.
  if (router.canDismiss()) router.dismissAll();
  router.navigate(context === 'instant' ? '/instant' : context === 'discovery' ? '/' : '/chats');
}

/**
 * Report someone (spec 42). The person is never told who reported them. From a chat, the
 * recent messages between the two go with the report so a moderator can see what happened.
 */
export function ReportScreen({ personId, name, context }: Props) {
  const styles = useStyles();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ blocked: boolean } | null>(null);

  async function submit() {
    if (!category) {
      setError('Choose what happened.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await reportUser({ targetId: personId, category, details, context, block });
      if (!result.ok) {
        setError(
          result.reason === 'rate_limited'
            ? "You've sent a lot of reports today. Try again tomorrow, or block them now."
            : "That report couldn't be sent. Try again.",
        );
        setBusy(false);
        return;
      }
      if (result.blocked) await refreshAfterBlock();
      setSent({ blocked: result.blocked });
    } catch {
      setError("That report couldn't be sent. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <SoulScreen
        edges={{ top: false, bottom: true }}
        footer={<SoulButton label="Done" onPress={() => done(sent.blocked, context)} block />}>
        <View style={styles.body}>
          <SoulText variant="section" italic accessibilityRole="header" style={styles.stretch}>
            Thanks for telling us
          </SoulText>
          <SoulText tone="secondary" style={styles.stretch}>
            {sent.blocked
              ? `SOUL will look into it. You've blocked ${name}, and they aren't told about the report or the block.`
              : `SOUL will look into it. ${name} isn't told who reported them.`}
          </SoulText>
        </View>
      </SoulScreen>
    );
  }

  return (
    <SoulScreen
      keyboard
      edges={{ top: false, bottom: true }}
      footer={
        <View style={styles.footer}>
          {error ? (
            <SoulText variant="supporting" align="center" role="alert">
              {error}
            </SoulText>
          ) : null}
          <SoulButton label="Send report" onPress={() => void submit()} loading={busy} block />
        </View>
      }>
      <SoulText variant="section" accessibilityRole="header" style={styles.title}>
        {`Report ${name}`}
      </SoulText>
      <SoulText variant="label" style={styles.label}>
        What happened?
      </SoulText>
      <View style={styles.categories} role="radiogroup" accessibilityLabel="What happened?">
        {REPORT_CATEGORIES.map((item) => (
          <SoulChip
            key={item}
            label={REPORT_LABEL[item]}
            selected={category === item}
            onPress={() => setCategory(item)}
          />
        ))}
      </View>
      <SoulInput
        label="Anything else (optional)"
        value={details}
        onChangeText={(text) => setDetails(text.slice(0, MAX_REPORT_DETAILS))}
        multiline
        maxLength={MAX_REPORT_DETAILS}
      />
      {context === 'chat' || context === 'instant' ? (
        <SoulText variant="supporting" tone="tertiary" style={styles.note}>
          {`Your recent messages with ${name} go with the report, so SOUL can see what happened.`}
        </SoulText>
      ) : null}
      <View style={styles.block}>
        <SoulCheckbox checked={block} onChange={setBlock} label={`Also block ${name}`} />
      </View>
    </SoulScreen>
  );
}

const useStyles = createThemedStyles(() =>
  StyleSheet.create({
    title: { marginTop: spacing.md },
    label: { marginTop: spacing.lg, marginBottom: spacing.sm },
    categories: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginBottom: spacing.lg,
    },
    note: { marginTop: spacing.sm },
    block: { marginTop: spacing.lg },
    body: { gap: spacing.md, paddingTop: spacing.lg },
    // Full width: shrink-wrapped serif text can lose its last word on Android.
    stretch: { alignSelf: 'stretch' },
    footer: { gap: spacing.xs },
  }),
);
