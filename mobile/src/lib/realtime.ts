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

async function listen<T>(channel: string, event: string, cb: (payload: T) => void): Promise<() => void> {
  const e = await connection();
  e.channel(channel).listen(event, cb);
  return () => e.leave(channel);
}

export const subscribeAlerts = (onAlert: (alert: AlertItem) => void) =>
  listen<{ alert: AlertItem }>('alerts', '.alert.updated', p => onAlert(p.alert));

/** Paths blocked/reopened or hazard rooms changed: refetch the campus snapshot and re-route. */
export const subscribeCampus = (onChange: () => void) => listen('campus', '.campus.updated', () => onChange());

/** SOS status changed or a new chat message: refetch the SOS. Private channel, sender and officers only. */
export async function subscribeSos(id: number, token: string, onChange: () => void): Promise<() => void> {
  authToken = token;
  const e = await connection();
  e.private(`sos.${id}`).listen('.sos.updated', () => onChange());
  return () => e.leave(`sos.${id}`);
}
