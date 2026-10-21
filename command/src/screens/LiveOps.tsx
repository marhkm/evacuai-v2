import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';

import { api } from '../api';
import { useLive, useSnapshot } from '../campus';
import { FloorPicker, useFloor } from '../components/FloorPicker';
import { PlanView } from '../components/PlanView';

const View3D = lazy(() => import('../components/View3D'));

type Counts = { total: number; safe: number; needs_help: number; unknown: number; sos: number };
export type SosItem = { id: number; person: string | null; place: string; status: string; message: string | null; created_at: string };
export type ReportItem = { id: number; hazard_type: string; place: string; matching: number; status: string };

export function LiveOps() {
  const snap = useSnapshot();
  const live = useLive();
  const floor = useFloor(snap.data);
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const safety = useQuery({ queryKey: ['safety'], queryFn: () => api<{ counts: Counts | null }>('/api/officer/safety') });
  const sos = useQuery({ queryKey: ['sos', 'open'], queryFn: () => api<{ sos: SosItem[] }>('/api/officer/sos?open=1') });
  const reports = useQuery({ queryKey: ['reports'], queryFn: () => api<{ reports: ReportItem[] }>('/api/officer/reports') });
  const counts = safety.data?.counts;

  return (
    <div className="liveops">
      <section className="feed" aria-label="Open SOS">
        <h2>Open SOS</h2>
        {sos.data?.sos.length === 0 && <p className="muted">No open SOS. New requests appear here instantly.</p>}
        {sos.data?.sos.map(s => (
          <Link key={s.id} to={`/sos/${s.id}`} className={`feed-item sos ${s.status}`}>
            <strong>{s.person ?? 'Someone'}</strong>
            <span>{s.place}</span>
            <span className="muted">{s.status} · {new Date(s.created_at).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}</span>
          </Link>
        ))}
      </section>

      <section className="map">
        <div className="map-bar">
          <h1>Live Ops</h1>
          {live.data?.alert && <span className="muted">{live.data.alert.label}</span>}
          <span className="spacer" />
          {snap.data && <FloorPicker snap={snap.data} floor={floor} />}
          <div className="toggle" role="group" aria-label="View">
            <button aria-pressed={mode === '2d'} onClick={() => setMode('2d')}>2D</button>
            <button aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>3D</button>
          </div>
        </div>
        {snap.error && <p className="banner danger" role="alert">Can't load the campus map. <button onClick={() => snap.refetch()}>Retry</button></p>}
        {snap.data && floor.building && (mode === '2d'
          ? <PlanView snap={snap.data} building={floor.building} level={floor.level} live={live.data} />
          : <Suspense fallback={<p className="muted">Loading 3D…</p>}><View3D snap={snap.data} live={live.data} /></Suspense>)}
      </section>

      <aside className="side">
        <section className="counters" aria-label="Safety counters">
          <div className="counter-box safe"><span className="counter">{counts?.safe ?? '–'}</span>Safe</div>
          <div className="counter-box warning"><span className="counter">{counts?.needs_help ?? '–'}</span>Needs help</div>
          <div className="counter-box"><span className="counter">{counts?.unknown ?? '–'}</span>Unknown</div>
        </section>
        {safety.data && !counts && <p className="muted">No active alert.</p>}
        <section aria-label="Latest reports">
          <h2>Reports</h2>
          {reports.data?.reports.length === 0 && <p className="muted">No hazard reports yet.</p>}
          {reports.data?.reports.slice(0, 8).map(r => (
            <Link key={r.id} to="/reports" className="feed-item">
              <strong>{r.hazard_type}</strong> <span className={r.matching >= 3 ? 'badge' : 'badge muted-badge'}>{r.matching}</span>
              <span>{r.place}</span>
              <span className="muted">{r.status}</span>
            </Link>
          ))}
        </section>
      </aside>
    </div>
  );
}
