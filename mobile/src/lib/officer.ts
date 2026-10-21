import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { subscribeAlerts, subscribeOfficers } from '@/lib/realtime';

/**
 * Officer API data (Responder mode), kept in memory only: names and places of people are never cached on the phone.
 * Refetches on the officers' live feed and on alert changes, and every 15 s in case the socket is down.
 */
export function useOfficer<T>(path: string) {
  const { token } = useAuth();
  // Kept with the path it belongs to: after switching floors the old floor's rows never show, and a late reply for
  // the old path is dropped (otherwise a tap could change a path on the floor the officer just left).
  const [state, setState] = useState<{ path: string; data: T | null; error: string | null }>({ path, data: null, error: null });
  const current = useRef(path);
  useEffect(() => { current.current = path; }, [path]); // before the fetch effect below, so replies compare against it

  const refresh = useCallback(
    () => (token && path
      ? api<T>(path, { token }).then(
        d => { if (current.current === path) setState({ path, data: d, error: null }); },
        (e: Error) => { if (current.current === path) setState(s => ({ path, data: s.path === path ? s.data : null, error: e.message })); },
      )
      : Promise.resolve()),
    [path, token],
  );

  useEffect(() => {
    if (!token || !path) return; // '' = not ready yet (e.g. the campus is still loading)
    refresh();
    let cancelled = false;
    const offs: (() => void)[] = [];
    const keep = (p: Promise<() => void>) => p.then(off => (cancelled ? off() : offs.push(off))).catch(() => undefined);
    keep(subscribeOfficers(token, refresh));
    keep(subscribeAlerts(() => refresh()));
    const poll = setInterval(refresh, 15_000);
    return () => { cancelled = true; offs.forEach(off => off()); clearInterval(poll); };
  }, [token, path, refresh]);

  const fresh = state.path === path;
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, refresh };
}

/** Runs an officer action with the bearer token; returns the error message, if any. */
export function useOfficerAction(after: () => unknown) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(path: string, method: 'POST' | 'PATCH' = 'POST', body?: unknown): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await api<T>(path, { method, token, body });
    } catch (e) {
      setError((e as Error).message); // e.g. another officer acted first: the server says what happened
      return undefined;
    } finally {
      setBusy(false);
      after();
    }
  };
  return { run, busy, error };
}
