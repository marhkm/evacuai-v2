import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { api } from '../api';

type Person = { id: number; name: string; role: string; status: string; place: string | null; source: string | null; updated_at: string | null; phone: string | null };
export type AlertOption = { id: number; label: string; active: boolean };
type Board = {
  alert: { id: number } | null;
  alerts: AlertOption[];
  counts: { total: number; safe: number; needs_help: number; unknown: number; sos: number } | null;
  occupancy: { name: string; count: number }[];
  people: Person[];
};

const FILTERS = [
  { value: '', label: 'Everyone' },
  { value: 'SOS', label: 'SOS' },
  { value: 'needs_help', label: 'Needs help' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'safe', label: 'Safe' },
];
const LABEL: Record<string, string> = { SOS: 'SOS', needs_help: 'Needs help', unknown: 'Unknown', safe: 'Safe' };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }) : '–');

export const useBoard = (alertId: number | null) =>
  useQuery({ queryKey: ['safety', alertId ?? 'current'], queryFn: () => api<Board>(`/api/officer/safety${alertId ? `?alert=${alertId}` : ''}`) });

export function Safety() {
  const [alertId, setAlertId] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const board = useBoard(alertId);
  const b = board.data;
  const id = alertId ?? b?.alert?.id ?? b?.alerts[0]?.id ?? null; // no active alert: the latest one
  const count = (status: string) => (status ? b?.people.filter(p => p.status === status).length ?? 0 : b?.people.length ?? 0);
  const people = b?.people.filter(p => !filter || p.status === filter) ?? [];
  const most = Math.max(1, ...(b?.occupancy.map(o => o.count) ?? []));

  return (
    <div className="stack">
      <div className="row">
        <h1>Safety</h1>
        <span className="spacer" />
        {b && b.alerts.length > 0 && (
          <label className="inline">Alert
            <select value={id ?? ''} onChange={e => setAlertId(Number(e.target.value))}>
              {b.alerts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
        )}
        {id && <a className="button" href={`/api/officer/alerts/${id}/report.csv`} download>Drill report (CSV)</a>}
      </div>
      {board.error && <p className="banner danger" role="alert">Can't load the safety board. <button onClick={() => board.refetch()}>Retry</button></p>}
      {b && !b.counts && <p className="muted">No active alert. Pick a past alert above, or broadcast one to start tracking.</p>}
      {b?.counts && (
        <>
          <section className="counters wide" aria-label="Safety counters">
            <div className="counter-box safe"><span className="counter">{b.counts.safe}</span>Safe</div>
            <div className="counter-box warning"><span className="counter">{b.counts.needs_help}</span>Needs help</div>
            <div className="counter-box"><span className="counter">{b.counts.unknown}</span>Unknown</div>
            <div className="counter-box danger"><span className="counter">{b.counts.sos}</span>Open SOS</div>
          </section>
          <section aria-label="Assembly points" className="occupancy">
            {b.occupancy.map(o => (
              <div key={o.name} className="bar-row">
                <span>{o.name}</span>
                <span className="bar"><span style={{ width: `${(o.count / most) * 100}%` }} /></span>
                <strong>{o.count}</strong>
              </div>
            ))}
          </section>
          <div className="toggle" role="group" aria-label="Filter people">
            {FILTERS.map(f => <button key={f.value} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label} {count(f.value)}</button>)}
          </div>
          <table>
            <thead><tr><th>Name</th><th>Status</th><th>Place</th><th>Source</th><th>Updated</th><th>Phone</th></tr></thead>
            <tbody>
              {people.map(p => (
                <tr key={p.id}>
                  <td>{p.name} <span className="muted">{p.role.replace('_', ' ')}</span></td>
                  <td><span className={`chip ${p.status}`}>{LABEL[p.status] ?? p.status}</span></td>
                  <td>{p.place ?? '–'}</td>
                  <td>{p.source ?? '–'}</td>
                  <td>{when(p.updated_at)}</td>
                  <td>{p.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : '–'}</td>
                </tr>
              ))}
              {people.length === 0 && <tr><td colSpan={6} className="muted">Nobody here.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
