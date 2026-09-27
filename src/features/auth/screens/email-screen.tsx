import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulInput } from '@/components/soul-input';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { requestCode } from '@/features/auth/api/auth';
import { authErrorMessage, AUTH_ERROR_COPY } from '@/features/auth/model/auth-errors';
import {
  isEmailShape,
  isObviouslyNotInstitutional,
  normalizeEmail,
  PRIMARY_INSTITUTIONAL_DOMAIN,
} from '@/features/auth/model/email';
import { useSignInStore } from '@/features/auth/sign-in-store';
import { spacing } from '@/theme';

function clientCheck(value: string): string | null {
  if (!isEmailShape(value)) return 'Enter your full SRMIST email address.';
  if (isObviouslyNotInstitutional(value)) return AUTH_ERROR_COPY.not_institutional;
  return null;
}

export function EmailScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const acceptedRulesVersion = useSignInStore((s) => s.acceptedRulesVersion);
  const setPendingEmail = useSignInStore((s) => s.setPendingEmail);

  async function onSend() {
    const problem = clientCheck(email);
    setTouched(true);
    setError(problem);
    if (problem) return;
    setSending(true);
    try {
      // The server is the authority on the domain; the client check is only for speed.
      await requestCode(email, acceptedRulesVersion);
      setPendingEmail(normalizeEmail(email));
      router.push('/verify');
    } catch (e) {
      setError(authErrorMessage(e as Error));
    } finally {
      setSending(false);
    }
  }

  return (
    <SoulScreen
      keyboard
      edges={{ top: false, bottom: true }}
      footer={<SoulButton label="Send code" block loading={sending} onPress={onSend} />}>
      <View style={styles.header}>
        <SoulText variant="title" accessibilityRole="header">
          Your SRMIST email
        </SoulText>
        <SoulText tone="secondary">
          We&apos;ll send a 6-digit code to confirm it&apos;s you. Only @
          {PRIMARY_INSTITUTIONAL_DOMAIN} addresses can join SOUL.
        </SoulText>
      </View>
      <SoulInput
        label="SRMIST email"
        placeholder={`netid@${PRIMARY_INSTITUTIONAL_DOMAIN}`}
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          // Re-validate as they type once an error has been shown.
          if (touched) setError(value ? clientCheck(value) : null);
        }}
        onBlur={() => {
          if (email) {
            setTouched(true);
            setError(clientCheck(email));
          }
        }}
        onSubmitEditing={onSend}
        error={error ?? undefined}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="send"
        autoFocus
      />
    </SoulScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.md },
});
