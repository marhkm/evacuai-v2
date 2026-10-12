import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Field, Link, Message, Screen } from '@/components/ui';
import { ApiError, api } from '@/lib/api';

export default function Reset() {
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const [form, setForm] = useState({ code: '', password: '', password_confirmation: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm(f => ({ ...f, [key]: value }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ message: string }>('/api/auth/reset-password', { method: 'POST', body: { email, ...form, code: form.code.trim() } });
      setDone(res.message);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Reset password">
      <Field label="6-digit code" value={form.code} onChangeText={set('code')} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" error={error?.fieldError('code')} />
      <Field label="New password" value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" error={error?.fieldError('password')} />
      <Field label="Confirm password" value={form.password_confirmation} onChangeText={set('password_confirmation')} secureTextEntry />
      <Message text={error && Object.keys(error.errors).length === 0 ? error.message : null} />
      <Message text={done} kind="info" />
      {done ? <Button label="Sign in" onPress={() => router.replace('/login')} /> : <Button label="Reset password" onPress={submit} busy={busy} />}
      <Link label="Back to sign in" onPress={() => router.replace('/login')} />
    </Screen>
  );
}
