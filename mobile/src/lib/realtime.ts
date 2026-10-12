import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

import { api, getServerUrl } from '@/lib/api';
import type { AlertItem } from '@/lib/alerts';

type ClientConfig = { reverb: { key: string; port: number; scheme: 'http' | 'https' } };

let echo: Promise<Echo<'reverb'>> | null = null;
let echoServer: string | null = null;

/**
 * One Reverb (Pusher protocol) connection per server, shared by all subscriptions. Connects to the same host as
 * the API with the public key/port from /api/client-config, so one build works against any server.
 */
function connection(): Promise<Echo<'reverb'>> {
  const server = getServerUrl();
  if (!echo || echoServer !== server) {
    echoServer = server;
    echo = api<ClientConfig>('/api/client-config').then(({ reverb }) => new Echo({
      broadcaster: 'reverb',
      key: reverb.key,
      wsHost: server.replace(/^https?:\/\//, '').replace(/[:/].*$/, ''),
      wsPort: reverb.port,
      wssPort: reverb.port,
      forceTLS: reverb.scheme === 'https',
      enabledTransports: ['ws', 'wss'],
      Pusher,
    }));
    echo.catch(() => { echo = null; }); // offline: retry on the next subscribe
  }
  return echo;
}

async function listen<T>(channel: string, event: string, cb: (payload: T) => void): Promise<() => void> {
  const e = await connection();
  e.channel(channel).listen(event, cb);
  return () => e.leave(channel);
}

export const subscribeAlerts = (onAlert: (alert: AlertItem) => void) =>
  listen<{ alert: AlertItem }>('alerts', '.alert.updated', p => onAlert(p.alert));

/** Paths blocked/reopened or hazard rooms changed: refetch the campus snapshot and re-route. */
export const subscribeCampus = (onChange: () => void) => listen('campus', '.campus.updated', () => onChange());
