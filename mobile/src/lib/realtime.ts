import Echo from 'laravel-echo';
import Pusher, { type ChannelAuthorizationCallback } from 'pusher-js';

import { api, getServerUrl } from '@/lib/api';
import type { AlertItem } from '@/lib/alerts';

type ClientConfig = { reverb: { key: string; port: number; scheme: 'http' | 'https' } };

let echo: Promise<Echo<'reverb'>> | null = null;
let echoServer: string | null = null;
let authToken: string | null = null; // read at subscribe time, so private channels use the current sign-in

/**
 * One Reverb (Pusher protocol) connection per server, shared by all subscriptions. Connects to the same host as
 * the API with the public key/port from /api/client-config, so one build works against any server.
 */
function connection(): Promise<Echo<'reverb'>> {
  const server = getServerUrl();
  if (!echo || echoServer !== server) {
    echoServer = server;
    hubs.clear(); // listeners belong to the old connection
    echo = api<ClientConfig>('/api/client-config').then(({ reverb }) => new Echo({
      broadcaster: 'reverb',
      key: reverb.key,
      wsHost: server.replace(/^https?:\/\//, '').replace(/[:/].*$/, ''),
      wsPort: reverb.port,
      wssPort: reverb.port,
      forceTLS: reverb.scheme === 'https',
      enabledTransports: ['ws', 'wss'],
      Pusher,
      // Private channels (SOS chat) are authorized by the API with the app's bearer token, not a cookie.
      authorizer: (channel: { name: string }) => ({
        authorize: (socketId: string, callback: ChannelAuthorizationCallback) => {
          api<Parameters<ChannelAuthorizationCallback>[1] & object>('/api/broadcasting/auth', { method: 'POST', token: authToken, body: { socket_id: socketId, channel_name: channel.name } })
            .then(data => callback(null, data), (error: Error) => callback(error, null));
        },
      }),
    }));
    echo.catch(() => { echo = null; }); // offline: retry on the next subscribe
  }
  return echo;
}

/**
 * Echo keeps one object per channel and leave() drops it for every listener, so screens share each channel through
 * a listener set and it is left only when the last listener goes. `debounceMs` merges bursts into one call.
 */
const hubs = new Map<string, Set<(payload: never) => void>>();
async function join<T>(name: string, events: string[], cb: (payload: T) => void, opts: { private?: boolean; debounceMs?: number } = {}): Promise<() => void> {
  const e = await connection();
  let set = hubs.get(name) as Set<(payload: T) => void> | undefined;
  if (!set) {
    const listeners = new Set<(payload: T) => void>();
    set = listeners;
    hubs.set(name, listeners as Set<(payload: never) => void>);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fan = (payload: T) => {
      if (!opts.debounceMs) return listeners.forEach(fn => fn(payload));
      clearTimeout(timer);
      timer = setTimeout(() => listeners.forEach(fn => fn(payload)), opts.debounceMs);
    };
    const channel = opts.private ? e.private(name) : e.channel(name);
    for (const event of events) channel.listen(event, fan);
  }
  const listeners = set;
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && hubs.get(name) === (listeners as Set<(payload: never) => void>)) {
      hubs.delete(name);
      e.leave(name);
    }
  };
}

export const subscribeAlerts = (onAlert: (alert: AlertItem) => void) =>
  join<{ alert: AlertItem }>('alerts', ['.alert.updated'], p => onAlert(p.alert));

/** Paths blocked/reopened or hazard rooms changed: refetch the campus snapshot and re-route. */
export const subscribeCampus = (onChange: () => void) => join('campus', ['.campus.updated'], () => onChange());

/** SOS status changed or a new chat message: refetch the SOS. Private channel, sender and officers only. */
export async function subscribeSos(id: number, token: string, onChange: () => void): Promise<() => void> {
  authToken = token;
  return join(`sos.${id}`, ['.sos.updated'], () => onChange(), { private: true });
}

/**
 * Officers' live feed (Responder mode): SOS changes, new hazard reports and check-ins. Private, officers only.
 * A drill sends a check-in event per person, so bursts are merged into one refresh per 1.5 s.
 */
export async function subscribeOfficers(token: string, onChange: () => void): Promise<() => void> {
  authToken = token;
  return join('officers', ['.sos.updated', '.report.submitted', '.checkin.updated'], () => onChange(), { private: true, debounceMs: 1500 });
}
