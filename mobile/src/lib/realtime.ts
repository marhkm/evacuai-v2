import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

import { api, getServerUrl } from '@/lib/api';
import type { AlertItem } from '@/lib/alerts';

type ClientConfig = { reverb: { key: string; port: number; scheme: 'http' | 'https' } };

/**
 * Live alerts over Laravel Reverb (Pusher protocol). Connects to the same host as the API, using the public
 * key/port from /api/client-config, so one build works against any server. Returns an unsubscribe function.
 */
export async function subscribeAlerts(onAlert: (alert: AlertItem) => void): Promise<() => void> {
  const { reverb } = await api<ClientConfig>('/api/client-config');
  const host = getServerUrl().replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
  const echo = new Echo({
    broadcaster: 'reverb',
    key: reverb.key,
    wsHost: host,
    wsPort: reverb.port,
    wssPort: reverb.port,
    forceTLS: reverb.scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    Pusher,
  });
  echo.channel('alerts').listen('.alert.updated', (e: { alert: AlertItem }) => onAlert(e.alert));

  return () => {
    echo.leave('alerts');
    echo.disconnect();
  };
}
