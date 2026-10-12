import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Field, Link, Message, Screen } from '@/components/ui';
import { ApiError, api } from '@/lib/api';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      router.push({ pathname: '/reset', params: { email: email.trim() } });
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Forgot password">
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" error={error?.fieldError('email')} />
      <Message text={error && !error.fieldError('email') ? error.message : null} />
      <Button label="Send code" onPress={submit} busy={busy} />
      <Link label="Back to sign in" onPress={() => router.replace('/login')} />
    </Screen>
  );
}
