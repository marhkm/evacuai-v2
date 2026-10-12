import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Text } from 'react-native';

import { Button, Field, Message, Screen, colors } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth, type User } from '@/lib/auth';

export default function Profile() {
  const { state } = useAuth();
  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') return <Redirect href="/login" />;
  return <ProfileForm user={state.user} />; // mounted only once the profile is known, so the form starts filled
}

function ProfileForm({ user }: { user: User }) {
  const { token, setUser, signOut } = useAuth();
  const [form, setForm] = useState({ name: user.name, department: user.department ?? '', phone: user.phone ?? '' });
  const [pw, setPw] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [deletePw, setDeletePw] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run(action: () => Promise<string>) {
    setError(null);
    setInfo(null);
    try {
      setInfo(await action());
    } catch (e) {
      setError(e as ApiError);
    }
  }

  const saveProfile = () => run(async () => {
    const res = await api<{ user: User }>('/api/me', { method: 'PATCH', token, body: { ...form, phone: form.phone.trim() || null } });
    await setUser(res.user);
    return 'Profile saved.';
  });

  const changePassword = () => run(async () => {
    await api('/api/me/password', { method: 'PUT', token, body: pw });
    setPw({ current_password: '', password: '', password_confirmation: '' });
    await setUser({ ...user, has_password: true });
    return 'Password updated.';
  });

  const deleteAccount = () => run(async () => {
    await api('/api/me', { method: 'DELETE', token, body: user.has_password ? { password: deletePw } : {} });
    await signOut();
    router.replace('/login');
    return '';
  });

  const confirmDelete = () => {
    if (Platform.OS === 'web') return deleteAccount();
    Alert.alert('Delete account?', 'This permanently deletes your EvacuAI account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: deleteAccount },
    ]);
  };

  return (
    <Screen title="Profile">
      <Text style={{ color: colors.muted }}>{user.email} · {user.role.replace('_', ' ')}</Text>
      <Field label="Full name" value={form.name} onChangeText={name => setForm(f => ({ ...f, name }))} autoCapitalize="words" error={error?.fieldError('name')} />
      <Field label="Department" value={form.department} onChangeText={department => setForm(f => ({ ...f, department }))} autoCapitalize="words" />
      <Field label="Mobile number" value={form.phone} onChangeText={phone => setForm(f => ({ ...f, phone }))} keyboardType="phone-pad" placeholder="09XXXXXXXXX" error={error?.fieldError('phone')} />
      <Button label="Save profile" onPress={saveProfile} />

      <Text style={{ fontSize: 18, fontWeight: '700', marginTop: 16 }}>{user.has_password ? 'Change password' : 'Set a password'}</Text>
      {user.has_password ? (
        <Field label="Current password" value={pw.current_password} onChangeText={v => setPw(p => ({ ...p, current_password: v }))} secureTextEntry error={error?.fieldError('current_password')} />
      ) : null}
      <Field label="New password" value={pw.password} onChangeText={v => setPw(p => ({ ...p, password: v }))} secureTextEntry error={error?.fieldError('password')} />
      <Field label="Confirm new password" value={pw.password_confirmation} onChangeText={v => setPw(p => ({ ...p, password_confirmation: v }))} secureTextEntry />
      <Button label="Update password" variant="secondary" onPress={changePassword} />

      <Message text={error && Object.keys(error.errors).length === 0 ? error.message : null} />
      <Message text={info} kind="info" />

      <Button label="Sign out" variant="secondary" onPress={async () => { await signOut(); router.replace('/login'); }} />

      <Text style={{ fontSize: 18, fontWeight: '700', marginTop: 16, color: colors.danger }}>Delete account</Text>
      {user.has_password ? (
        <Field label="Password to confirm deletion" value={deletePw} onChangeText={setDeletePw} secureTextEntry error={error?.fieldError('password') && deletePw ? error.fieldError('password') : undefined} />
      ) : null}
      <Button label="Delete my account" variant="danger" onPress={confirmDelete} />
    </Screen>
  );
}
