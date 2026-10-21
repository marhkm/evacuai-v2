import type { Edge, EdgeStatus } from '@evacuai/routing';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { api } from '../api';
import { useLive, useSnapshot } from '../campus';
import { FloorPicker, useFloor } from '../components/FloorPicker';
import { PlanView } from '../components/PlanView';
import { useAction } from '../useAction';

type PathRow = { id: string; type: string; from: string; to: string; status: EdgeStatus; updated_by: string | null; updated_at: string | null };
const STATUSES: { value: EdgeStatus; label: string }[] = [{ value: 'open', label: 'Open' }, { value: 'congested', label: 'Congested' }, { value: 'blocked', label: 'Blocked' }];

export function Paths() {
  const snap = useSnapshot();
  const live = useLive();
  const floor = useFloor(snap.data);
  const [selected, setSelected] = useState<Edge | null>(null);
  const paths = useQuery({
    queryKey: ['paths', floor.building, floor.level],
    queryFn: () => api<{ paths: PathRow[] }>(`/api/officer/paths?building=${floor.building}&level=${floor.level}`),
    enabled: !!floor.building,
  });
  const action = useAction(['paths'], ['live'], ['overview']);
  // Edge ids contain "/" and "->": encoded as one path segment.
  const set = (id: string, status: EdgeStatus) => action.run(() => api(`/api/officer/paths/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } }));
  const statusOf = (id: string): EdgeStatus => live.data?.edges?.[id] ?? 'open';
  const name = (id: string) => snap.data?.nodes.find(n => n.id === id)?.name ?? id.split('/').pop();

  return (
    <div className="stack">
      <div className="row">
        <h1>Paths</h1>
        <span className="spacer" />
        {snap.data && <FloorPicker snap={snap.data} floor={{ ...floor, set: (b, l) => { setSelected(null); floor.set(b, l); } }} />}
      </div>
      <p className="muted">Click a path on the plan to mark it. Blocked paths are never routed; congested ones are avoided when there is another way. Every phone re-routes at once.</p>
      {action.error && <p className="banner danger" role="alert">{action.error}</p>}
      <div className="paths-layout">
        {snap.data && floor.building && <PlanView snap={snap.data} building={floor.building} level={floor.level} live={live.data} onEdge={setSelected} />}
        {selected && (
          <section className="card panel" aria-label="Selected path">
            <h2>{name(selected.from)} → {name(selected.to)}</h2>
            <p className="muted">{selected.type} · {Math.round(selected.distance_m)} m</p>
            <div className="toggle" role="group" aria-label="Status">
              {STATUSES.map(s => (
                <button key={s.value} aria-pressed={statusOf(selected.id) === s.value} disabled={action.busy} onClick={() => set(selected.id, s.value)}>{s.label}</button>
              ))}
            </div>
            <button onClick={() => setSelected(null)}>Close</button>
          </section>
        )}
      </div>
      <h2>Paths on this floor</h2>
      {paths.data?.paths.length === 0 && <p className="muted">No paths on this floor.</p>}
      {!!paths.data?.paths.length && (
        <table>
          <thead><tr><th>From</th><th>To</th><th>Type</th><th>Status</th><th>Changed by</th></tr></thead>
          <tbody>
            {paths.data.paths.map(p => (
              <tr key={p.id}>
                <td>{p.from}</td>
                <td>{p.to}</td>
                <td>{p.type}</td>
                <td>
                  <select aria-label={`Status of ${p.from} to ${p.to}`} value={p.status} onChange={e => set(p.id, e.target.value as EdgeStatus)}>
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>
                <td className="muted">{p.updated_by ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
