import type { LiveState } from '@evacuai/campus-3d';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { useSnapshot } from '../campus';
import { useBoard } from './Safety';

const View3D = lazy(() => import('../components/View3D'));

type Replay = {
  alert: { id: number; label: string };
  duration: number;
  events: { t: number; p: number; room: string | null }[];
  checkins: { t: number; p: number; node: string }[];
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Where everyone was `t` seconds after the alert: last room per person not yet checked in, and check-ins per point. */
function stateAt(r: Replay, t: number): LiveState & { inside: number; safe: number } {
  const safe = new Set(r.checkins.filter(c => c.t <= t).map(c => c.p));
  const room = new Map<number, string>();
  for (const e of r.events) if (e.t <= t && e.room && !safe.has(e.p)) room.set(e.p, e.room);
  const roomCounts: Record<string, number> = {};
  for (const id of room.values()) roomCounts[id] = (roomCounts[id] ?? 0) + 1;
  const atPoint: Record<string, number> = {};
  for (const c of r.checkins) if (c.t <= t) atPoint[c.node] = (atPoint[c.node] ?? 0) + 1;
  const pins = Object.entries(atPoint).map(([node, n]) => ({ id: `checkin-${node}`, nodeId: node, kind: 'checkin' as const, label: `${n} checked in safe` }));
  return { roomCounts, pins, inside: room.size, safe: safe.size };
}

export function Replay() {
  const snap = useSnapshot();
  const board = useBoard(null);
  const [alertId, setAlertId] = useState<number | null>(null);
  const id = alertId ?? board.data?.alerts[0]?.id ?? null;
  const replay = useQuery({
    queryKey: ['replay', id],
    queryFn: () => api<Replay>(`/api/officer/replay?alert=${id}`),
    enabled: id !== null,
    refetchInterval: false,
  });
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const r = replay.data;

  useEffect(() => {
    if (!playing || !r) return;
    const timer = setInterval(() => setT(v => (v + 2 >= r.duration ? (setPlaying(false), r.duration) : v + 2)), 200); // 10× speed
    return () => clearInterval(timer);
  }, [playing, r]);

  const state = useMemo(() => (r ? stateAt(r, t) : null), [r, t]);

  return (
    <div className="stack">
      <div className="row">
        <h1>Replay</h1>
        <span className="spacer" />
        {board.data && board.data.alerts.length > 0 && (
          <label className="inline">Alert
            <select value={id ?? ''} onChange={e => { setAlertId(Number(e.target.value)); setT(0); setPlaying(false); }}>
              {board.data.alerts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
        )}
      </div>
      {board.data?.alerts.length === 0 && <p className="muted">No drills or alerts to replay yet.</p>}
      {replay.error && <p className="banner danger" role="alert">Can't load this replay. <button onClick={() => replay.refetch()}>Retry</button></p>}
      {r && state && (
        <>
          <div className="row replay-bar">
            <button onClick={() => { if (t >= r.duration) setT(0); setPlaying(p => !p); }}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min={0} max={r.duration} step={1} value={t} aria-label="Time since the alert"
              onChange={e => { setPlaying(false); setT(Number(e.target.value)); }} />
            <span className="clock">{clock(t)} / {clock(r.duration)}</span>
            <span className="muted">{state.inside} still inside · {state.safe} checked in</span>
          </div>
          {snap.data && <Suspense fallback={<p className="muted">Loading 3D…</p>}><View3D snap={snap.data} live={state} /></Suspense>}
          <p className="muted">People are numbered, not named: the replay shows movement only.</p>
        </>
      )}
    </div>
  );
}
