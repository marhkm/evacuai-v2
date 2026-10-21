import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import { ApiError } from './api';
import { connectSocket, type Socket } from './socket';

// Which queries each broadcast makes stale. Events carry no data we patch in: queries simply refetch.
const TABLE: [channel: string, event: string, keys: string[][], isPrivate: boolean][] = [
  ['officers', '.sos.updated', [['sos'], ['live'], ['overview']], true], // overview: the rail's open-SOS badge
  ['officers', '.report.submitted', [['reports'], ['live']], true],
  ['officers', '.checkin.updated', [['safety'], ['live']], true],
  ['alerts', '.alert.updated', [['alerts'], ['overview'], ['live'], ['safety']], false], // the active alert changed
  ['campus', '.campus.updated', [['paths'], ['live']], false],
];

let live = false;
const watchers = new Set<() => void>();
const setLive = (up: boolean) => {
  live = up;
  watchers.forEach(w => w());
};

/** Poll every 15 s while the socket is down, so screens keep updating without Reverb. */
export const refetchInterval = () => (live ? false : 15_000);

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchInterval,
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      },
    },
  });
}

/** Connects Echo once (mounted by the Shell) and wires the invalidation table. */
export function useRealtime(): { connected: boolean } {
  const client = useQueryClient();
  const connected = useSyncExternalStore(
    cb => { watchers.add(cb); return () => watchers.delete(cb); },
    () => live,
  );
  useEffect(() => {
    let socket: Socket | null = null;
    let stopped = false;
    connectSocket().then(s => {
      if (stopped) return s.disconnect();
      socket = s;
      for (const [channel, event, keys, isPrivate] of TABLE) {
        s.listen(channel, event, () => keys.forEach(queryKey => client.invalidateQueries({ queryKey })), isPrivate);
      }
      // Either way, refetch: on reconnect to catch up on missed events, on loss to start the polling timers.
      s.onState(up => {
        if (up === live) return;
        setLive(up);
        client.invalidateQueries();
      });
    }, () => setLive(false));
    return () => {
      stopped = true;
      socket?.disconnect();
      setLive(false);
    };
  }, [client]);
  return { connected };
}
