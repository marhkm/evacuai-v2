/** A failed officer API call: the HTTP status, Laravel's message and its validation errors. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public errors: Record<string, string[]> = {}) {
    super(message);
  }
}

const expired = new Set<() => void>();
const refused = new Set<() => void>();

/**
 * Called on any 401, and on 419 (a POST after the session timed out fails the CSRF check first):
 * the web session ended (signed out elsewhere, or timed out).
 */
export function onSessionExpired(cb: () => void): () => void {
  expired.add(cb);
  return () => expired.delete(cb);
}

/** Called when the officer API answers 404 (it does so for non-officers): the role may have been taken away. */
export function onOfficerRefused(cb: () => void): () => void {
  refused.add(cb);
  return () => refused.delete(cb);
}

// Laravel sets XSRF-TOKEN (readable by scripts) next to the HttpOnly session cookie; it must come back as a header.
const xsrf = () => decodeURIComponent(document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/)?.[1] ?? '');

/** Same-origin JSON call, authenticated by the web session cookie. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (xsrf()) headers['X-XSRF-TOKEN'] = xsrf();
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 401 || res.status === 419) expired.forEach(cb => cb());
  if (res.status === 404 && path.startsWith('/api/officer/') && path !== '/api/officer/me') refused.forEach(cb => cb());
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.message ?? res.statusText, data?.errors ?? {});
  return data as T;
}

/** Sets the XSRF-TOKEN cookie before the first state-changing request. */
export const csrf = () => fetch('/sanctum/csrf-cookie', { method: 'GET', credentials: 'same-origin' });
