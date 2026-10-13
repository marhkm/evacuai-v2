import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { AppState } from 'react-native';

import { openRouteOnAlertTap } from '@/lib/alertTap';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerForPush } from '@/lib/push';
import { subscribeAlerts } from '@/lib/realtime';
import { storage } from '@/lib/storage';

export type AlertItem = {
  id: number;
  hazard_type: string;
  severity_level: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  translations?: { ceb?: string; fil?: string } | null; // officer-reviewed Cebuano / Filipino
  status: 'active' | 'resolved' | 'retracted';
  source: string;
  verified: boolean;
  is_drill: boolean;
  building_id: string | null;
  issued_at: string | null;
  resolved_at: string | null;
};

/** Same wording as the server's push title, e.g. "[DRILL] UNVERIFIED EARTHQUAKE ALERT". */
export function alertTitle(a: AlertItem): string {
  return `${a.is_drill ? '[DRILL] ' : ''}${a.verified ? '' : 'UNVERIFIED '}${a.hazard_type.replace(/_/g, ' ').toUpperCase()} ALERT`;
}

/** Cebuano and Filipino versions to show under the English message. */
export const alertTranslations = (a: AlertItem): string[] => [a.translations?.ceb, a.translations?.fil].filter((t): t is string => !!t);

type Ctx = { alerts: AlertItem[]; active: AlertItem[]; refresh: () => Promise<void> };
const AlertsContext = createContext<Ctx>({ alerts: [], active: [], refresh: async () => undefined });

function upsert(list: AlertItem[], a: AlertItem): AlertItem[] {
  return [a, ...list.filter(x => x.id !== a.id)].sort((x, y) => (y.issued_at ?? '').localeCompare(x.issued_at ?? ''));
}

/** Loads alerts, keeps them live over Reverb, refreshes when the app returns to the foreground, caches for offline. */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const save = useCallback((next: AlertItem[]) => {
    setAlerts(next);
    storage.set('alerts', JSON.stringify(next)).catch(() => undefined);
  }, []);

  const refresh = useCallback(
    (): Promise<void> =>
      token
        ? api<{ alerts?: AlertItem[] }>('/api/alerts', { token })
          .then(res => save(Array.isArray(res?.alerts) ? res.alerts : []))
          .catch(() => storage.get('alerts').then(cached => { if (cached) setAlerts(JSON.parse(cached)); }))
        : Promise.resolve(),
    [token, save],
  );

  useEffect(() => {
    if (!token) return;
    refresh();
    registerForPush(token).catch(() => undefined);
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    subscribeAlerts(a => setAlerts(list => {
      const next = upsert(list, a);
      storage.set('alerts', JSON.stringify(next)).catch(() => undefined);
      return next;
    }))
      .then(u => (cancelled ? u() : (unsubscribe = u)))
      .catch(() => undefined); // offline: the foreground refresh catches up
    const sub = AppState.addEventListener('change', s => s === 'active' && refresh());
    const offTap = openRouteOnAlertTap(() => router.push('/route'));
    return () => {
      cancelled = true;
      unsubscribe?.();
      sub.remove();
      offTap();
    };
  }, [token, refresh]);

  const value = useMemo(() => {
    const visible = token ? alerts : []; // signed out: show nothing, without a setState in the effect
    return { alerts: visible, active: visible.filter(a => a.status === 'active'), refresh };
  }, [token, alerts, refresh]);
  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export const useAlerts = () => useContext(AlertsContext);
