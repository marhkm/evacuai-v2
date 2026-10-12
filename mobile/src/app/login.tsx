import { router } from 'expo-router';
import { useState } from 'react';

import { GoogleButton } from '@/components/GoogleButton';
import { ServerSetting } from '@/components/ServerSetting';
import { Button, Field, Link, Message, Screen } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { DEVICE_NAME, useAuth, type User } from '@/lib/auth';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST', body: { email: email.trim(), password, device_name: DEVICE_NAME },
      });
      await signIn(res.token, res.user);
      router.replace('/');
    } catch (e) {
      const err = e as ApiError;
      if (err.reason === 'email_not_verified') {
        await api('/api/auth/resend-code', { method: 'POST', body: { email: email.trim() } }).catch(() => undefined);
        router.push({ pathname: '/verify', params: { email: email.trim() } });
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Sign in">
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" error={error?.fieldError('email')} />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" error={error?.fieldError('password')} />
      <Message text={error && !error.fieldError('email') && !error.fieldError('password') ? error.message : null} />
      <Button label="Sign in" onPress={submit} busy={busy} />
      <GoogleButton onError={setError} />
      <Link label="Create an account" onPress={() => router.push('/register')} />
      <Link label="Forgot password?" onPress={() => router.push('/forgot')} />
      <ServerSetting />
    </Screen>
  );
}
