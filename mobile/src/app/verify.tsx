import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Field, Link, Message, Screen, colors } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { DEVICE_NAME, useAuth, type User } from '@/lib/auth';

export default function Verify() {
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: User }>('/api/auth/verify-email', {
        method: 'POST', body: { email, code: code.trim(), device_name: DEVICE_NAME },
      });
      await signIn(res.token, res.user);
      router.replace('/');
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      await api('/api/auth/resend-code', { method: 'POST', body: { email } });
      setInfo('A new code is on its way.');
    } catch (e) {
      setError(e as ApiError);
    }
  }

  return (
    <Screen title="Verify your email">
      <Text style={{ fontSize: 16, color: colors.muted }}>We sent a 6-digit code to {email}.</Text>
      <Field label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" error={error?.fieldError('code')} />
      <Message text={error && !error.fieldError('code') ? error.message : null} />
      <Message text={info} kind="info" />
      <Button label="Verify" onPress={submit} busy={busy} />
      <Link label="Send a new code" onPress={resend} />
    </Screen>
  );
}
