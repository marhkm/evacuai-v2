import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { ApiError, api, setServerUrl } from '@/lib/api';
import { storage } from '@/lib/storage';
import { forgetWhereabouts } from '@/lib/whereabouts';

export type User = {
  id: number;
  name: string;
  email: string;
  role: 'student' | 'faculty' | 'staff' | 'safety_officer' | 'admin';
  department: string | null;
  phone: string | null;
  email_verified: boolean;
  consented: boolean;
  has_password: boolean;
};

type State = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: User; token: string };

type Auth = {
  state: State;
  token: string | null;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => Promise<void>;
};

export const DEVICE_NAME = `${Platform.OS} app`;
const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    (async () => {
      const server = await storage.get('server_url');
      if (server) setServerUrl(server);
      const token = await storage.get('token');
      const cached = await storage.get('user');
      if (!token || !cached) return setState({ status: 'signedOut' });
      try {
        const { user } = await api<{ user: User }>('/api/me', { token });
        await storage.set('user', JSON.stringify(user));
        setState({ status: 'signedIn', user, token });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await Promise.all([storage.remove('token'), storage.remove('user')]);
          return setState({ status: 'signedOut' });
        }
        // Offline (common during emergencies): keep the session with the last known profile.
        setState({ status: 'signedIn', user: JSON.parse(cached), token });
      }
    })();
  }, []);

  const signIn = useCallback(async (token: string, user: User) => {
    await Promise.all([storage.set('token', token), storage.set('user', JSON.stringify(user))]);
    setState({ status: 'signedIn', user, token });
  }, []);

  const signOut = useCallback(async () => {
    const token = await storage.get('token');
    if (token) await api('/api/auth/logout', { method: 'POST', token }).catch(() => undefined);
    await Promise.all([storage.remove('token'), storage.remove('user')]);
    forgetWhereabouts();
    setState({ status: 'signedOut' });
  }, []);

  const setUser = useCallback(async (user: User) => {
    await storage.set('user', JSON.stringify(user));
    setState(s => (s.status === 'signedIn' ? { ...s, user } : s));
  }, []);

  const value = useMemo(
    () => ({ state, token: state.status === 'signedIn' ? state.token : null, signIn, signOut, setUser }),
    [state, signIn, signOut, setUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
