import * as AuthSession from 'expo-auth-session';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { Button } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { DEVICE_NAME, useAuth, type User } from '@/lib/auth';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const MICROSOFT_CLIENT_ID = process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID;
const MICROSOFT_TENANT_ID = process.env.EXPO_PUBLIC_MICROSOFT_TENANT_ID;

/**
 * Social sign-in for the web build: browser OAuth (implicit access token) → POST /api/auth/<provider>, which verifies
 * the token with the provider. Each button appears only when its client id is configured.
 * ponytail: phone APKs need native sign-in modules + a development build; added with the EAS build step.
 */
export function SocialButtons({ onError }: { onError: (e: ApiError) => void }) {
  if (Platform.OS !== 'web') return null;
  return (
    <>
      {GOOGLE_CLIENT_ID ? (
        <OAuthButton provider="google" label="Continue with Google" issuer="https://accounts.google.com"
          clientId={GOOGLE_CLIENT_ID} scopes={['openid', 'email', 'profile']} onError={onError} />
      ) : null}
      {MICROSOFT_CLIENT_ID && MICROSOFT_TENANT_ID ? (
        <OAuthButton provider="microsoft" label="Continue with Microsoft 365" issuer={`https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/v2.0`}
          clientId={MICROSOFT_CLIENT_ID} scopes={['openid', 'email', 'profile', 'User.Read']} onError={onError} />
      ) : null}
    </>
  );
}

function OAuthButton({ provider, label, issuer, clientId, scopes, onError }: {
  provider: 'google' | 'microsoft'; label: string; issuer: string; clientId: string; scopes: string[]; onError: (e: ApiError) => void;
}) {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const discovery = AuthSession.useAutoDiscovery(issuer);
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId, scopes, responseType: AuthSession.ResponseType.Token, redirectUri: AuthSession.makeRedirectUri() },
    discovery,
  );

  useEffect(() => {
    if (response?.type !== 'success' || !response.params.access_token) return;
    api<{ token: string; user: User }>(`/api/auth/${provider}`, {
      method: 'POST', body: { access_token: response.params.access_token, device_name: DEVICE_NAME },
    })
      .then(res => signIn(res.token, res.user))
      .then(() => router.replace('/'))
      .catch(e => onError(e as ApiError))
      .finally(() => setBusy(false));
  }, [response, provider, signIn, onError]);

  return <Button label={label} variant="secondary" busy={busy || !request} onPress={() => {
    setBusy(true); // stays on through the token exchange in the effect above
    promptAsync().then(r => { if (r.type !== 'success') setBusy(false); });
  }} />;
}
