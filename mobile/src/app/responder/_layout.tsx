import { Redirect, Stack } from 'expo-router';

import { isOfficer, useAuth } from '@/lib/auth';

/** Responder mode is for safety officers and admins; anyone else is sent to the normal home. */
export default function ResponderLayout() {
  const { state } = useAuth();
  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') return <Redirect href="/login" />;
  if (!isOfficer(state.user)) return <Redirect href="/" />;
  if (!state.user.consented) return <Redirect href="/consent" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
