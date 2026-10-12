import type { CampusSnapshot } from '@evacuai/routing';

import { api } from '@/lib/api';
import { current, observe, routeOrigin, type Estimate, type Observation } from '@/lib/estimator';

// Last known location, shared by the route, SOS and check-in screens. Memory only: never written to the phone.
let last: Estimate | null = null;

export const lastEstimate = (now = Date.now()) => current(last, now);

/**
 * Applies a new observation and returns the resulting estimate. While an alert is active the server gets a
 * location event (Safety Monitor's "last known location"); otherwise nothing leaves the phone (RA 10173).
 */
export function updateWhereabouts(obs: Observation, token: string | null, alertActive: boolean): Estimate {
  const next = observe(last, obs, Date.now());
  if (next === last) return next;
  last = next;
  if (token && alertActive) {
    api('/api/location', {
      method: 'POST', token,
      body: { source: next.source, confidence: next.confidence, node_id: next.nodeId ?? null, room_id: next.roomId ?? null, building_id: next.building ?? null, level: next.floor ?? null },
    }).catch(() => undefined);
  }
  return next;
}

/** Graph node for the last known location, if any. */
export const lastNode = (snap: CampusSnapshot | null) => (snap ? routeOrigin(snap, lastEstimate()) : null);

export function forgetWhereabouts() {
  last = null;
}
