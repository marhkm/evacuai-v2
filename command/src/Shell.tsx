import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { api } from './api';
import { signOut, useMe } from './auth';
import { useRealtime } from './realtime';

type Tab = 'sos' | 'reports' | 'feedback';
type Overview = {
  stats: { open_sos: number; unowned_sos?: number };
  unseen?: Record<Tab, number>;
  active_alert: { hazard_type: string; severity_level: string; is_drill: boolean } | null;
};

export const SCREENS = [
  { path: '/', label: 'Live Ops', key: 'l' },
  { path: '/alerts', label: 'Alerts', key: 'a' },
  { path: '/reports', label: 'Reports', key: 'r' },
  { path: '/paths', label: 'Paths', key: 'p' },
  { path: '/sos', label: 'SOS', key: 's' },
  { path: '/safety', label: 'Safety', key: 'y' },
  { path: '/replay', label: 'Replay', key: 'e' },
  { path: '/feedback', label: 'Feedback', key: 'f' },
];

// Screens with a "new" badge, and the tab name the server stamps when the officer opens them.
const TABS: Record<string, Tab> = { '/sos': 'sos', '/reports': 'reports', '/feedback': 'feedback' };

/** The badge count: unseen items; for SOS also any open SOS nobody owns yet (looking at it does not clear that). */
function badge(o: Overview | undefined, tab: Tab): number {
  const n = o?.unseen?.[tab] ?? 0;
  return tab === 'sos' ? Math.max(n, o?.stats.unowned_sos ?? 0) : n;
}

/** Opening a badged tab marks it seen (only when it has something new, so no request loop). */
function useMarkSeen(o: Overview | undefined) {
  const { pathname } = useLocation();
  const client = useQueryClient();
  const tab = Object.entries(TABS).find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1];
  const unseen = tab ? o?.unseen?.[tab] ?? 0 : 0;
  useEffect(() => {
    if (!tab || unseen === 0) return;
    api(`/api/officer/seen/${tab}`, { method: 'POST' }).then(() => client.invalidateQueries({ queryKey: ['overview'] }), () => {});
  }, [tab, unseen, client]);
}

const TIMEZONE = 'Asia/Manila'; // campus time, as config('evacuai.timezone')

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <time className="clock">{now.toLocaleTimeString('en-PH', { timeZone: TIMEZONE, hour12: false })}</time>;
}

/** "g" then a screen's letter moves there (g l = Live Ops, g a = Alerts, g s = SOS …). */
function useShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    let armed = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const screen = armed && SCREENS.find(s => s.key === e.key);
      armed = e.key === 'g';
      if (screen) navigate(screen.path);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}

export function Shell() {
  const { connected } = useRealtime();
  const me = useMe();
  const overview = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/api/officer/overview') });
  const navigate = useNavigate();
  const client = useQueryClient();
  useShortcuts();
  useMarkSeen(overview.data);

  const alert = overview.data?.active_alert;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">EVACUAI COMMAND</span>
        <span className={connected ? 'status live' : 'status reconnecting'} role="status">{connected ? 'LIVE' : 'RECONNECTING'}</span>
        <Clock />
        {alert && (
          <span className={`pill hazard ${alert.is_drill ? 'drill' : ''}`}>
            {alert.is_drill ? 'DRILL · ' : ''}{alert.hazard_type} · {alert.severity_level}
          </span>
        )}
        <span className="spacer" />
        <span>{me.data?.name}</span>
        <button onClick={async () => { await signOut(); client.clear(); navigate('/sign-in', { replace: true }); }}>Sign out</button>
      </header>
      <nav className="rail" aria-label="Screens">
        {SCREENS.map(s => (
          <NavLink key={s.path} to={s.path} end={s.path === '/'}>
            {s.label}
            {TABS[s.path] && badge(overview.data, TABS[s.path]) > 0 && (
              <span className="badge" aria-label={`${badge(overview.data, TABS[s.path])} new`}>{badge(overview.data, TABS[s.path])}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <main className="screen">
        <Outlet />
      </main>
    </div>
  );
}
