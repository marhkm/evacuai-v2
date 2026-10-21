import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';

import { api, ApiError, onOfficerRefused, onSessionExpired } from './api';

export type Me = { id: number; name: string; role: 'safety_officer' | 'admin' };

export const useMe = () =>
  useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/officer/me'), staleTime: Infinity, refetchInterval: false });

export const signOut = () => api('/command/session', { method: 'DELETE' }).catch(() => {});

/** Officer-only screens: no session goes to sign-in; a non-officer (the API answers 404) is told and signed out. */
export function RequireOfficer({ children }: { children: ReactNode }) {
  const me = useMe();
  const navigate = useNavigate();
  const client = useQueryClient();

  useEffect(() => onSessionExpired(() => {
    client.clear();
    navigate('/sign-in', { replace: true });
  }), [client, navigate]);
  // Re-check the role; if it is gone, `me` answers 404 too and the Demoted screen takes over.
  useEffect(() => onOfficerRefused(() => { client.invalidateQueries({ queryKey: ['me'] }); }), [client]);

  if (me.isPending) return <p className="center muted">Loading…</p>;
  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/sign-in" replace />;
  if (me.error instanceof ApiError && me.error.status === 404) return <Demoted />;
  if (me.error) {
    return (
      <div className="center banner" role="alert">
        Can't reach the server. <button onClick={() => me.refetch()}>Retry</button>
      </div>
    );
  }
  return children;
}

function Demoted() {
  useEffect(() => { signOut(); }, []);
  return (
    <div className="center card">
      <h1>Access ended</h1>
      <p>Your account no longer has officer access.</p>
      <Link to="/sign-in">Back to sign in</Link>
    </div>
  );
}
