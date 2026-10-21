import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { api, ApiError, csrf } from '../api';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const client = useQueryClient();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await csrf();
      await api('/command/session', { method: 'POST', body: { email, password } });
      client.removeQueries({ queryKey: ['me'] }); // forget the signed-out answer
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? (err.errors.email?.[0] ?? err.message) : "Can't reach the server.");
      setBusy(false);
    }
  }

  return (
    <main className="signin">
      <form className="card" onSubmit={submit}>
        <h1 className="brand">EVACUAI COMMAND</h1>
        <p className="muted">Safety officers and admins only.</p>
        <label>
          Email
          <input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {error && <p className="banner danger" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>Sign in</button>
      </form>
    </main>
  );
}
