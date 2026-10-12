import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Field, Link, Message, Screen } from '@/components/ui';
import { ApiError, api } from '@/lib/api';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', password_confirmation: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm(f => ({ ...f, [key]: value }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const email = form.email.trim();
      await api('/api/auth/register', { method: 'POST', body: { ...form, email } });
      router.replace({ pathname: '/verify', params: { email } });
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Create account">
      <Field label="Full name" value={form.name} onChangeText={set('name')} autoCapitalize="words" error={error?.fieldError('name')} />
      <Field label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoComplete="email" error={error?.fieldError('email')} />
      <Field label="Password" value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" error={error?.fieldError('password')} />
      <Field label="Confirm password" value={form.password_confirmation} onChangeText={set('password_confirmation')} secureTextEntry />
      <Message text={error && Object.keys(error.errors).length === 0 ? error.message : null} />
      <Button label="Create account" onPress={submit} busy={busy} />
      <Link label="I already have an account" onPress={() => router.replace('/login')} />
    </Screen>
  );
}
