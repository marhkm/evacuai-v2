import type { CampusSnapshot } from '@evacuai/routing';
import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { loadSnapshot } from '@/lib/campus';
import { subscribeCampus } from '@/lib/realtime';

/** Campus snapshot that stays current: cached for offline, refetched (ETag) whenever an officer changes a path. */
export function useCampus() {
  const { token } = useAuth();
  const [snapshot, setSnapshot] = useState<CampusSnapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const load = () => loadSnapshot(token)
      .then(r => { if (!cancelled) { setSnapshot(r.snapshot); setOffline(r.offline); setError(null); } })
      .catch(e => { if (!cancelled) setError((e as Error).message); });
    load();
    subscribeCampus(load).then(u => (cancelled ? u() : (unsubscribe = u))).catch(() => undefined);
    return () => { cancelled = true; unsubscribe?.(); };
  }, [token]);

  return { snapshot, offline, error };
}
