import { useQuery } from '@tanstack/react-query';

import { api } from '../api';

type Feedback = { average: number | null; count: number; items: { rating: number; comments: string | null; created_at: string | null; name: string | null }[] };

export function Feedback() {
  const fb = useQuery({ queryKey: ['feedback'], queryFn: () => api<Feedback>('/api/officer/feedback') });
  const d = fb.data;
  return (
    <div className="stack">
      <h1>Feedback</h1>
      {fb.error && <p className="banner danger" role="alert">Can't load feedback. <button onClick={() => fb.refetch()}>Retry</button></p>}
      {d && (
        <section className="counters" aria-label="Rating">
          <div className="counter-box"><span className="counter">{d.average ?? '–'}</span>Average rating (of 5)</div>
          <div className="counter-box"><span className="counter">{d.count}</span>Responses</div>
        </section>
      )}
      {d?.items.length === 0 && <p className="muted">No feedback yet. People can rate the app from their profile after a drill.</p>}
      <ul className="list">
        {d?.items.map((f, i) => (
          <li key={i} className="feed-item">
            <strong aria-label={`${f.rating} of 5`}>{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</strong>
            {f.comments && <span>{f.comments}</span>}
            <span className="muted">{f.name ?? 'Anonymous'}{f.created_at ? ` · ${new Date(f.created_at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
