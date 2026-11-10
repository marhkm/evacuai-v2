import { API_URL } from '@/config';

let serverUrl = API_URL;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Turns what a student types into a server address: "192.168.1.5" becomes "http://192.168.1.5:8000" (a PC on the
 * Wi-Fi) and "evacuai.tech" becomes "https://evacuai.tech" (a real server). A typed scheme or port is kept, and the
 * web app's and live updates' ports are refused. Parsed by hand: React Native's URL cannot set a port.
 */
export function normalizeServerUrl(input: string): { url: string } | { error: string } {
  const typed = input.trim();
  if (!typed) return { url: API_URL };
  const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?([^/:?#\s]+)(?::(\d+))?(?:[/?#].*)?$/i.exec(typed);
  if (!m) return { error: 'Type an address like http://192.168.1.5:8000.' };
  const [, scheme, host, port] = m;
  if (port === '8081') return { error: "That's the web app's port. Use 8000." };
  if (port === '8080') return { error: "That's the live-updates port. Use 8000." };
  const local = host.toLowerCase() === 'localhost' || IPV4.test(host); // a PC on the Wi-Fi: http and :8000
  const addPort = !scheme && !port && local;
  return { url: `${(scheme ?? (local ? 'http' : 'https')).toLowerCase()}://${host}${port ? `:${port}` : addPort ? ':8000' : ''}` }; // a domain: https
}

/** Test builds let students point the app at their own PC (e.g. http://192.168.1.5:8000). A refused address keeps the old one. */
export function setServerUrl(url: string) {
  const r = normalizeServerUrl(url);
  if ('url' in r) serverUrl = r.url;
}

/** "Test connection": does an EvacuAI server answer at this address within 5 seconds? */
export async function testServer(url: string): Promise<'ok' | 'unreachable' | 'timeout' | 'not-evacuai'> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 5000);
  try {
    const res = await fetch(`${url}/api/client-config`, { headers: { Accept: 'application/json' }, signal: abort.signal });
    const data = await res.json().catch(() => null);
    return res.ok && data?.reverb ? 'ok' : 'not-evacuai';
  } catch {
    return abort.signal.aborted ? 'timeout' : 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

export function getServerUrl() {
  return serverUrl;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors: Record<string, string[]> = {},
    public reason?: string,
    public body: Record<string, unknown> = {}, // the whole error reply (e.g. a 409 says what is already there)
  ) {
    super(message);
  }

  fieldError(field: string): string | undefined {
    return this.errors[field]?.[0];
  }
}

type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown; token?: string | null };

export async function api<T = any>(path: string, { method = 'GET', body, token }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${serverUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(`Cannot reach the server at ${serverUrl}. Check that the phone is on the same Wi-Fi and that Windows Firewall allows port 8000 on the PC.`, 0);
  }

  if (res.status === 204) return null as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = res.status === 429 ? 'Too many attempts. Wait a minute and try again.' : data.message ?? `Request failed (${res.status}).`;
    throw new ApiError(message, res.status, data.errors ?? {}, data.reason, data);
  }
  return data as T;
}
