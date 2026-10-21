import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';

import { api } from '../api';
import { usePaged } from '../paged';
import { useAction } from '../useAction';
import type { SosItem } from './LiveOps';

type Message = { id: number; body: string; mine: boolean; sender: string; created_at: string };
type SosDetail = SosItem & { responder: string | null; messages: Message[] };

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });
const OPEN = ['pending', 'acknowledged'];

function Chat({ id }: { id: string }) {
  const sos = useQuery({ queryKey: ['sos', id], queryFn: () => api<{ sos: SosDetail }>(`/api/officer/sos/${id}`) });
  const action = useAction(['sos'], ['live'], ['overview']);
  const [body, setBody] = useState('');
  const s = sos.data?.sos;

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    const ok = await action.run(() => api(`/api/officer/sos/${id}/messages`, { method: 'POST', body: { body: text } }));
    if (ok) setBody('');
  }
  const post = (verb: string) => action.run(() => api(`/api/officer/sos/${id}/${verb}`, { method: 'POST' }));

  if (sos.error) return <p className="banner danger" role="alert">Can't load this SOS. <button onClick={() => sos.refetch()}>Retry</button></p>;
  if (!s) return <p className="muted">Loading…</p>;
  const open = OPEN.includes(s.status);
  return (
    <section className="chat card" aria-label={`SOS from ${s.person ?? 'someone'}`}>
      <header className="row">
        <div>
          <h2>{s.person ?? 'Someone'}</h2>
          <div>{s.place}</div>
          <div className="muted">Sent {time(s.created_at)}{s.responder ? ` · acknowledged by ${s.responder}` : ''}</div>
        </div>
        <span className="spacer" />
        <span className={`chip ${s.status}`}>{s.status}</span>
        {s.status === 'pending' && <button className="primary" onClick={() => post('acknowledge')}>Acknowledge</button>}
        {open && <button onClick={() => window.confirm('Mark this person as helped and close the SOS?') && post('resolve')}>Resolve</button>}
      </header>
      {s.message && <p className="banner danger">{s.message}</p>}
      <ol className="messages">
        {s.messages.map(m => (
          <li key={m.id} className={m.mine ? 'mine' : undefined}>
            <span className="muted">{m.sender} · {time(m.created_at)}</span>
            <p>{m.body}</p>
          </li>
        ))}
        {s.messages.length === 0 && <li className="muted">No messages yet. Tell them help is coming.</li>}
      </ol>
      {action.error && <p className="banner danger" role="alert">{action.error}</p>}
      {open && (
        <form className="row" onSubmit={send}>
          <label className="grow">Message
            <textarea rows={2} maxLength={500} value={body} onChange={e => setBody(e.target.value)} />
          </label>
          <button className="primary" type="submit" disabled={action.busy || !body.trim()}>Send</button>
        </form>
      )}
    </section>
  );
}

export function Sos() {
  const { id } = useParams();
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const list = usePaged<SosItem>(['sos', 'list', filter], filter === 'open' ? '/api/officer/sos?open=1' : '/api/officer/sos', 'sos');

  return (
    <div className="sos-screen">
      <section className="stack">
        <div className="row">
          <h1>SOS</h1>
          <span className="spacer" />
          <div className="toggle" role="group" aria-label="Show">
            <button aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>Open</button>
            <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
          </div>
        </div>
        {list.error && <p className="banner danger" role="alert">Can't load SOS requests. <button onClick={() => list.refetch()}>Retry</button></p>}
        {list.isSuccess && list.items.length === 0 && <p className="muted">No open SOS. New requests appear here instantly.</p>}
        {list.items.map(s => (
          <Link key={s.id} to={`/sos/${s.id}`} className={`feed-item sos ${s.status}${String(s.id) === id ? ' selected' : ''}`}>
            <strong>{s.person ?? 'Someone'}</strong>
            <span>{s.place}</span>
            <span className="muted">{s.status} · {time(s.created_at)}</span>
            {s.message && <span>{s.message}</span>}
          </Link>
        ))}
        {list.hasNextPage && <button onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>Load more</button>}
      </section>
      {id ? <Chat key={id} id={id} /> : <p className="muted center">Pick an SOS to see the conversation.</p>}
    </div>
  );
}
