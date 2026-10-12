import { API_URL } from '@/config';

let serverUrl = API_URL;

/** Test builds let students point the app at their own PC (e.g. http://192.168.1.5:8000). */
export function setServerUrl(url: string) {
  serverUrl = url.trim().replace(/\/+$/, '') || API_URL;
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
    throw new ApiError(`Cannot reach the server at ${serverUrl}. Check your connection or the server address.`, 0);
  }

  if (res.status === 204) return null as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = res.status === 429 ? 'Too many attempts. Wait a minute and try again.' : data.message ?? `Request failed (${res.status}).`;
    throw new ApiError(message, res.status, data.errors ?? {}, data.reason);
  }
  return data as T;
}
