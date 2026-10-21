import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { api, ApiError } from '../api';
import { useSnapshot } from '../campus';
import { useAction } from '../useAction';

export type Alert = {
  id: number;
  hazard_type: string;
  severity_level: string;
  message: string;
  translations: { ceb?: string; fil?: string } | null;
  status: 'draft' | 'active' | 'resolved' | 'retracted';
  source: string | null;
  verified: boolean;
  is_drill: boolean;
  building_id: string | null;
  issued_at: string | null;
};

const HAZARDS = { earthquake: 'Earthquake', fire: 'Fire', flood: 'Flood', structural_damage: 'Structural damage', other: 'Other / general' };
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['draft', 'active', 'resolved', 'retracted'];
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '–');

function BroadcastForm() {
  const snap = useSnapshot();
  const empty = { hazard_type: 'fire', severity_level: 'high', building_id: '', message: '', is_drill: false, ceb: '', fil: '' };
  const [form, setForm] = useState(empty);
  const action = useAction(['alerts'], ['overview']);
  const set = (patch: Partial<typeof empty>) => setForm(f => ({ ...f, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      hazard_type: form.hazard_type, severity_level: form.severity_level, building_id: form.building_id || null,
      message: form.message, is_drill: form.is_drill, translations: { ceb: form.ceb || null, fil: form.fil || null },
    };
    const send = (confirm: boolean) => api<{ needs_confirmation?: boolean; reporters?: number }>('/api/officer/alerts', { method: 'POST', body: { ...payload, confirm } });
    const sent = await action.run(async () => {
      const first = await send(false);
      if (!first.needs_confirmation) return true;
      const n = first.reporters ?? 0;
      const ok = window.confirm(`Only ${n} matching report${n === 1 ? '' : 's'} so far (3 are needed to broadcast on reports alone). Broadcast only if you verified this incident directly. Broadcast now?`);
      return ok ? (await send(true), true) : false;
    });
    if (sent) setForm(empty);
  }

  async function translate() {
    action.setError(null);
    try {
      const t = await api<{ ceb: string; fil: string }>('/api/officer/alerts/translate', { method: 'POST', body: { message: form.message } });
      set({ ceb: t.ceb, fil: t.fil });
    } catch (e) {
      action.setError(e instanceof ApiError && e.status === 404 ? "AI translation isn't set up on this server." : 'Translation failed. Type the translations, or send in English only.');
    }
  }

  return (
    <form className="card broadcast" onSubmit={submit}>
      <h2>Broadcast an alert</h2>
      <div className="row">
        <label>Hazard
          <select value={form.hazard_type} onChange={e => set({ hazard_type: e.target.value })}>
            {Object.entries(HAZARDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>Severity
          <select value={form.severity_level} onChange={e => set({ severity_level: e.target.value })}>
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Building
          <select value={form.building_id} onChange={e => set({ building_id: e.target.value })}>
            <option value="">Campus-wide</option>
            {snap.data?.buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={form.is_drill} onChange={e => set({ is_drill: e.target.checked })} /> Drill</label>
      </div>
      <label>Message
        <textarea required maxLength={500} rows={3} value={form.message} onChange={e => set({ message: e.target.value })} />
      </label>
      <div className="row">
        <label>Cebuano<textarea maxLength={600} rows={2} value={form.ceb} onChange={e => set({ ceb: e.target.value })} /></label>
        <label>Filipino<textarea maxLength={600} rows={2} value={form.fil} onChange={e => set({ fil: e.target.value })} /></label>
      </div>
      {action.error && <p className="banner danger" role="alert">{action.error}</p>}
      <div className="row end">
        <button type="button" onClick={translate} disabled={!form.message.trim()}>Translate with AI</button>
        <button className="primary" type="submit" disabled={action.busy}>Broadcast</button>
      </div>
    </form>
  );
}

function AlertRow({ alert, act }: { alert: Alert; act: (path: string, question: string | null, body?: unknown) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const post = (verb: string, question: string) => act(`/api/officer/alerts/${alert.id}/${verb}`, question);
  return (
    <tr className={alert.is_drill ? 'drill-row' : undefined}>
      <td><span className={`chip ${alert.status}`}>{alert.status}</span>{alert.is_drill && <span className="chip info">drill</span>}{alert.status === 'active' && !alert.verified && <span className="chip warning">unverified</span>}</td>
      <td>{HAZARDS[alert.hazard_type as keyof typeof HAZARDS] ?? alert.hazard_type} · {alert.severity_level}</td>
      <td>
        {editing === null ? alert.message : (
          <label className="sr-label">Message to publish
            <textarea rows={3} maxLength={500} value={editing} onChange={e => setEditing(e.target.value)} />
          </label>
        )}
        {alert.source && alert.source !== 'officer' && <div className="muted">from {alert.source.toUpperCase()}</div>}
      </td>
      <td>{alert.building_id ?? 'Campus-wide'}</td>
      <td>{when(alert.issued_at)}</td>
      <td className="actions">
        {alert.status === 'draft' && (editing === null
          ? <>
            <button onClick={() => setEditing(alert.message)}>Publish</button>
            <button onClick={() => post('discard', 'Discard this draft? Nobody will be alerted.')}>Discard</button>
          </>
          : <>
            <button className="primary" onClick={() => { act(`/api/officer/alerts/${alert.id}/publish`, null, { message: editing }); setEditing(null); }}>Publish now</button>
            <button onClick={() => setEditing(null)}>Cancel</button>
          </>)}
        {alert.status === 'active' && <>
          {!alert.verified && <button onClick={() => post('confirm', 'Mark this alert as verified?')}>Confirm</button>}
          <button onClick={() => post('resolve', 'Resolve this alert? Everyone is told it is over.')}>Resolve</button>
          <button onClick={() => post('retract', 'Retract this alert as a false alarm?')}>Retract</button>
        </>}
      </td>
    </tr>
  );
}

export function Alerts() {
  const [status, setStatus] = useState('');
  const alerts = useQuery({
    queryKey: ['alerts', status],
    queryFn: () => api<{ alerts: Alert[] }>(`/api/officer/alerts${status ? `?status=${status}` : ''}`),
  });
  const action = useAction(['alerts'], ['overview']);
  const act = (path: string, question: string | null, body?: unknown) => {
    if (question && !window.confirm(question)) return;
    action.run(() => api(path, { method: 'POST', body }));
  };

  return (
    <div className="stack">
      <h1>Alerts</h1>
      <BroadcastForm />
      <div className="row">
        <h2>All alerts</h2>
        <span className="spacer" />
        <label className="inline">Status
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      {action.error && <p className="banner danger" role="alert">{action.error}</p>}
      {alerts.error && <p className="banner danger" role="alert">Can't load alerts. <button onClick={() => alerts.refetch()}>Retry</button></p>}
      {alerts.data?.alerts.length === 0 && <p className="muted">No alerts yet. Broadcast one above, or wait for a PHIVOLCS or PAGASA draft.</p>}
      {!!alerts.data?.alerts.length && (
        <table>
          <thead><tr><th>Status</th><th>Hazard</th><th>Message</th><th>Building</th><th>Issued</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{alerts.data.alerts.map(a => <AlertRow key={a.id} alert={a} act={act} />)}</tbody>
        </table>
      )}
    </div>
  );
}
