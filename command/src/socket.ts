import Echo from 'laravel-echo';
import Pusher, { type ChannelAuthorizationCallback } from 'pusher-js';

import { api } from './api';

/** The few things the app needs from Reverb; tests swap this module for a fake. */
export type Socket = {
  listen(channel: string, event: string, cb: () => void, isPrivate?: boolean): void;
  onState(cb: (connected: boolean) => void): void;
  disconnect(): void;
};

type ClientConfig = { reverb: { key: string; port: number; scheme: 'http' | 'https' } };

/** One Reverb connection to this host, with the public key and port from /api/client-config (as the phone app). */
export async function connectSocket(): Promise<Socket> {
  const { reverb } = await api<ClientConfig>('/api/client-config');
  const echo = new Echo({
    broadcaster: 'reverb',
    key: reverb.key,
    wsHost: location.hostname,
    wsPort: reverb.port,
    wssPort: reverb.port,
    forceTLS: reverb.scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    Pusher,
    // Private channels are authorized by the web session; api() adds the current XSRF token each time.
    authorizer: (channel: { name: string }) => ({
      authorize: (socketId: string, callback: ChannelAuthorizationCallback) => {
        api<Parameters<ChannelAuthorizationCallback>[1] & object>('/api/broadcasting/auth', { method: 'POST', body: { socket_id: socketId, channel_name: channel.name } })
          .then(data => callback(null, data), (error: Error) => callback(error, null));
      },
    }),
  });
  return {
    listen: (channel, event, cb, isPrivate) => (isPrivate ? echo.private(channel) : echo.channel(channel)).listen(event, cb),
    onState: cb => (echo.connector as unknown as { pusher: Pusher }).pusher.connection.bind('state_change', (s: { current: string }) => cb(s.current === 'connected')),
    disconnect: () => echo.disconnect(),
  };
}
