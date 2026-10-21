import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';

import { api } from './api';
import { signOut, useMe } from './auth';
import { useRealtime } from './realtime';

type Overview = {
  stats: { open_sos: number };
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

  const alert = overview.data?.active_alert;
  const openSos = overview.data?.stats.open_sos ?? 0;

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
            {s.path === '/sos' && openSos > 0 && <span className="badge" aria-label={`${openSos} open`}>{openSos}</span>}
          </NavLink>
        ))}
      </nav>
      <main className="screen">
        <Outlet />
      </main>
    </div>
  );
}
