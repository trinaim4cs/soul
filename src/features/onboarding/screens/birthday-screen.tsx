import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulInput } from '@/components/soul-input';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { useCurrentUserId } from '@/features/auth/account-status-provider';
import { refreshAccountStatus, setDateOfBirth } from '@/features/auth/api/auth';
import { authErrorMessage } from '@/features/auth/model/auth-errors';
import {
  ageOn,
  formatDobInput,
  MINIMUM_AGE,
  parseDob,
  toIsoDate,
} from '@/features/auth/model/date-of-birth';
import { spacing } from '@/theme';

/**
 * Age like other dating apps (D-028): self-declared date of birth, confirmed once, 18+
 * enforced by the server. The date itself is never shown to other people.
 */
export function BirthdayScreen() {
  const userId = useCurrentUserId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const parsed = parseDob(value);
  const age = parsed ? ageOn(parsed, new Date()) : null;
  const complete = value.replace(/\D/g, '').length === 8;

  async function onConfirm() {
    if (!parsed) {
      setError('Enter a real date as DD / MM / YYYY.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await setDateOfBirth(toIsoDate(parsed));
      if (!result.ok && result.reason === 'invalid_date') {
        setError('Enter a real date as DD / MM / YYYY.');
        return;
      }
      // Success, under-18 and locked states are all decided by the server status.
      if (userId) await refreshAccountStatus(userId);
    } catch (e) {
      setError(authErrorMessage(e as Error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SoulScreen
      keyboard
      edges={{ top: true, bottom: true }}
      footer={
        <>
          {age !== null && age >= MINIMUM_AGE ? (
            <SoulText variant="caption" tone="tertiary" align="center">
              Your birthday can&apos;t be changed later.
            </SoulText>
          ) : null}
          <SoulButton
            label={age !== null && age >= MINIMUM_AGE ? `Confirm, I'm ${age}` : 'Continue'}
            block
            loading={saving}
            disabled={!complete}
            onPress={onConfirm}
          />
        </>
      }>
      <View style={styles.header}>
        <SoulText variant="title" accessibilityRole="header">
          When&apos;s your birthday?
        </SoulText>
        <SoulText tone="secondary">
          Your age shows on your profile. Your birthday stays private.
        </SoulText>
      </View>
      <SoulInput
        label="Date of birth"
        placeholder="DD / MM / YYYY"
        value={value}
        onChangeText={(text) => {
          setValue(formatDobInput(text));
          setError(null);
        }}
        error={error ?? (complete && !parsed ? 'Enter a real date as DD / MM / YYYY.' : undefined)}
        keyboardType="number-pad"
        autoComplete="birthdate-full"
        textContentType="none"
        maxLength={14}
        autoFocus
      />
    </SoulScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.md },
});
