import { useEffect, useState } from 'react';

import { api, ApiError } from '../api';
import { usePaged } from '../paged';
import { useAction } from '../useAction';

type Report = {
  id: number;
  hazard_type: string;
  place: string;
  description: string | null;
  status: 'pending' | 'verified' | 'dismissed' | 'resolved';
  reporter: string | null;
  matching: number;
  photo_url: string | null;
  created_at: string | null;
};

const STATUSES = ['pending', 'verified', 'dismissed', 'resolved'];
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '–');

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Report photo" onClick={onClose}>
      <img src={src} alt="Photo attached to the hazard report" onClick={e => e.stopPropagation()} />
      <button autoFocus onClick={onClose}>Close</button>
    </div>
  );
}

export function Reports() {
  const [status, setStatus] = useState('');
  const list = usePaged<Report>(['reports', 'desk', status], `/api/officer/reports${status ? `?status=${status}` : ''}`, 'reports');
  const action = useAction(['reports'], ['live'], ['overview']);
  const [photo, setPhoto] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<number, string>>({});

  const act = (r: Report, verb: string) => action.run(() => api(`/api/officer/reports/${r.id}/${verb}`, { method: 'POST' }));
  async function summarize(r: Report) {
    action.setError(null);
    try {
      const s = await api<{ text: string }>(`/api/officer/reports/${r.id}/summary`, { method: 'POST' });
      setSummaries(m => ({ ...m, [r.id]: s.text }));
    } catch (e) {
      action.setError(e instanceof ApiError && e.status === 404 ? "AI summaries aren't set up on this server." : 'No summary right now. Try again in a minute.');
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <h1>Reports</h1>
        <span className="spacer" />
        <label className="inline">Status
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <p className="muted">Three matching reports (same hazard, building and floor, different people) let an alert go out without direct confirmation.</p>
      {action.error && <p className="banner danger" role="alert">{action.error}</p>}
      {list.error && <p className="banner danger" role="alert">Can't load reports. <button onClick={() => list.refetch()}>Retry</button></p>}
      {list.isSuccess && list.items.length === 0 && <p className="muted">No hazard reports. New ones appear here instantly.</p>}
      {list.items.length > 0 && (
        <table>
          <thead><tr><th>Matching</th><th>Hazard</th><th>Report</th><th>Place</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {list.items.map(r => (
              <tr key={r.id}>
                <td><span className={r.matching >= 3 ? 'badge hot' : 'badge muted-badge'} aria-label={`${r.matching} matching reports`}>{r.matching}</span></td>
                <td>{r.hazard_type}</td>
                <td>
                  {r.description ?? <span className="muted">No description</span>}
                  <div className="muted">{r.reporter ?? 'Unknown'} · {when(r.created_at)}</div>
                  {summaries[r.id] && <p className="summary">{summaries[r.id]}</p>}
                </td>
                <td>{r.place}</td>
                <td><span className={`chip ${r.status}`}>{r.status}</span></td>
                <td className="actions">
                  {r.photo_url && <button onClick={() => setPhoto(r.photo_url)}>View photo</button>}
                  {r.status === 'pending' && <>
                    <button onClick={() => act(r, 'verify')}>Verify</button>
                    <button onClick={() => act(r, 'dismiss')}>Dismiss</button>
                  </>}
                  {r.status === 'verified' && <button onClick={() => act(r, 'resolve')}>Resolve</button>}
                  <button onClick={() => summarize(r)}>Summarize</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.hasNextPage && <button onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>Load more</button>}
      {photo && <Lightbox src={photo} onClose={() => setPhoto(null)} />}
    </div>
  );
}
