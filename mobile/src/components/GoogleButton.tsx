import * as AuthSession from 'expo-auth-session';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { Button } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { DEVICE_NAME, useAuth, type User } from '@/lib/auth';

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

/**
 * Google sign-in for the web build (browser OAuth, implicit access token → POST /api/auth/google).
 * ponytail: phone APKs need a native Google Sign-In module + development build + SHA-1; added with the EAS build step.
 */
export function GoogleButton({ onError }: { onError: (e: ApiError) => void }) {
  if (Platform.OS !== 'web' || !WEB_CLIENT_ID) return null;
  return <WebGoogleButton clientId={WEB_CLIENT_ID} onError={onError} />;
}

function WebGoogleButton({ clientId, onError }: { clientId: string; onError: (e: ApiError) => void }) {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com');
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId, scopes: ['openid', 'email', 'profile'], responseType: AuthSession.ResponseType.Token, redirectUri: AuthSession.makeRedirectUri() },
    discovery,
  );

  useEffect(() => {
    if (response?.type !== 'success' || !response.params.access_token) return;
    api<{ token: string; user: User }>('/api/auth/google', {
      method: 'POST', body: { access_token: response.params.access_token, device_name: DEVICE_NAME },
    })
      .then(res => signIn(res.token, res.user))
      .then(() => router.replace('/'))
      .catch(e => onError(e as ApiError))
      .finally(() => setBusy(false));
  }, [response, signIn, onError]);

  return <Button label="Continue with Google" variant="secondary" busy={busy || !request} onPress={() => {
    setBusy(true); // stays on through the token exchange in the effect above
    promptAsync().then(r => { if (r.type !== 'success') setBusy(false); });
  }} />;
}
