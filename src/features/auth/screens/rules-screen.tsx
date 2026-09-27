import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulCheckbox } from '@/components/soul-checkbox';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { acceptTerms, refreshAccountStatus } from '@/features/auth/api/auth';
import { authErrorMessage } from '@/features/auth/model/auth-errors';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import {
  DOCUMENTS_ARE_DRAFT,
  DRAFT_LABEL,
  TERMS_VERSION,
  type LegalDocumentId,
} from '@/features/auth/legal/documents';
import { useSignInStore } from '@/features/auth/sign-in-store';
import { spacing } from '@/theme';

type Item = { key: string; label: string; document?: LegalDocumentId };

const ITEMS: Item[] = [
  { key: 'age', label: "I'm 18 or older.", document: 'eligibility' },
  {
    key: 'student',
    label: "I'm a current SRMIST student and will use my own SRMIST email.",
    document: 'verification',
  },
  { key: 'community', label: "I'll follow SOUL's community rules.", document: 'community' },
  { key: 'terms', label: 'I agree to the Terms of Service.', document: 'terms' },
  { key: 'privacy', label: "I've read the Privacy Policy.", document: 'privacy' },
];

type Props = {
  /**
   * `sign-in`: before email entry; the ticked version travels with sign-up.
   * `update`: a signed-in user must accept a newer version.
   */
  mode: 'sign-in' | 'update';
};

/** Every rule must be ticked before continuing (DECISIONS D-029). No item is pre-ticked. */
export function RulesScreen({ mode }: Props) {
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAcceptedRules = useSignInStore((s) => s.setAcceptedRules);
  const userId = useCurrentUserId();
  const allTicked = ITEMS.every((item) => ticked[item.key]);

  async function onContinue() {
    if (!allTicked) return;
    if (mode === 'sign-in') {
      setAcceptedRules(TERMS_VERSION);
      router.push('/email');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await acceptTerms(TERMS_VERSION);
      if (!result.ok) {
        setError('These rules have been updated. Update SOUL to continue.');
        return;
      }
      if (userId) await refreshAccountStatus(userId);
    } catch (e) {
      setError(authErrorMessage(e as Error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SoulScreen
      scroll
      edges={{ top: mode === 'update', bottom: true }}
      footer={
        <>
          {error ? (
            <SoulText variant="supporting" accessibilityLiveRegion="polite">
              {error}
            </SoulText>
          ) : !allTicked ? (
            <SoulText variant="caption" tone="tertiary" align="center">
              Tick every box to continue.
            </SoulText>
          ) : null}
          <SoulButton
            label="Continue"
            block
            disabled={!allTicked}
            loading={submitting}
            onPress={onContinue}
          />
        </>
      }>
      <View style={styles.header}>
        <SoulText variant="title" accessibilityRole="header">
          Before you start
        </SoulText>
        <SoulText tone="secondary">
          SOUL is a small community of SRM students. These rules keep it safe and kind.
        </SoulText>
      </View>
      <View style={styles.list}>
        {ITEMS.map((item) => (
          <SoulCheckbox
            key={item.key}
            label={item.label}
            checked={Boolean(ticked[item.key])}
            onChange={(value) => setTicked((prev) => ({ ...prev, [item.key]: value }))}>
            {item.document ? (
              <SoulText
                variant="supporting"
                accessibilityRole="link"
                style={styles.link}
                onPress={() => router.push(`/legal/${item.document}`)}>
                Read it
              </SoulText>
            ) : null}
          </SoulCheckbox>
        ))}
      </View>
      {DOCUMENTS_ARE_DRAFT ? (
        <SoulText variant="caption" tone="tertiary">
          {DRAFT_LABEL}
        </SoulText>
      ) : null}
    </SoulScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.md },
  list: { gap: spacing.xxs },
  link: { textDecorationLine: 'underline', alignSelf: 'flex-start' },
});
