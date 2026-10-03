import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SoulButton } from '@/components/soul-button';
import { SoulIcon } from '@/components/soul-icon';
import { SoulScreen } from '@/components/soul-screen';
import { SoulText } from '@/components/soul-text';
import { requestCode, verifyCode } from '@/features/auth/api/auth';
import { CodeInput } from '@/features/auth/components/code-input';
import { authErrorMessage } from '@/features/auth/model/auth-errors';
import { useSignInStore } from '@/features/auth/sign-in-store';
import { spacing } from '@/theme';

/** Matches the server's resend window (`auth.email.max_frequency`). */
const RESEND_SECONDS = 60;

export function VerifyCodeScreen() {
  const email = useSignInStore((s) => s.pendingEmail);
  const acceptedRulesVersion = useSignInStore((s) => s.acceptedRulesVersion);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    // Without a pending email (for example after a restart), start again from email entry.
    if (!email) router.replace('/email');
  }, [email]);

  async function submit(value: string) {
    if (!email || value.length !== 6 || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      // Success signs the user in; routing then follows the server status automatically.
      await verifyCode(email, value);
    } catch (e) {
      setError(authErrorMessage(e as Error));
      setCode('');
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    if (!email || resendIn > 0) return;
    setError(null);
    try {
      await requestCode(email, acceptedRulesVersion);
      setNotice('New code sent. Check your inbox.');
      setResendIn(RESEND_SECONDS);
    } catch (e) {
      setError(authErrorMessage(e as Error));
    }
  }

  const minutes = Math.floor(resendIn / 60);
  const seconds = String(resendIn % 60).padStart(2, '0');

  return (
    <SoulScreen
      keyboard
      edges={{ top: false, bottom: true }}
      footer={
        <SoulButton
          label="Verify"
          block
          loading={verifying}
          disabled={code.length !== 6}
          onPress={() => submit(code)}
        />
      }>
      <View style={styles.header}>
        <SoulText variant="title" accessibilityRole="header">
          Enter your code
        </SoulText>
        <SoulText tone="secondary">
          We sent a 6-digit code to{' '}
          <SoulText variant="bodyStrong">{email ?? 'your SRMIST email'}</SoulText>. It expires in 10
          minutes.
        </SoulText>
      </View>

      <CodeInput
        value={code}
        onChange={(value) => {
          setCode(value);
          setError(null);
          if (value.length === 6) submit(value);
        }}
        invalid={Boolean(error)}
        editable={!verifying}
      />

      {error ? (
        <View style={styles.message} accessibilityLiveRegion="polite">
          <SoulIcon name="error" size="sm" weight="regular" />
          <SoulText variant="supporting" style={styles.flex}>
            {error}
          </SoulText>
        </View>
      ) : notice ? (
        <SoulText variant="supporting" tone="secondary" accessibilityLiveRegion="polite">
          {notice}
        </SoulText>
      ) : null}

      <View style={styles.links}>
        {resendIn > 0 ? (
          <SoulText variant="supporting" tone="tertiary" numeric>
            Send a new code in {minutes}:{seconds}
          </SoulText>
        ) : (
          <SoulButton label="Send a new code" variant="ghost" size="sm" inline onPress={resend} />
        )}
        <SoulButton
          label="Use a different email"
          variant="ghost"
          size="sm"
          inline
          onPress={() => router.back()}
        />
      </View>
    </SoulScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.md },
  message: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  links: { gap: spacing.xs, alignItems: 'flex-start', marginTop: spacing.sm },
});
