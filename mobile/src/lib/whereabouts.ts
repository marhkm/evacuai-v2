import type { CampusSnapshot } from '@evacuai/routing';

import { api } from '@/lib/api';
import { applyFloorChange, current, observe, routeOrigin, startForClass, type ClassNow, type Estimate, type Observation } from '@/lib/estimator';
import { storage } from '@/lib/storage';

/**
 * Last known location, shared by the route, SOS and check-in screens. Kept on this phone only (never sent unless an
 * alert is active) until the end of the day, so a scan or room pick made in calm times is ready when an alarm sounds.
 * Cleared on sign-out.
 */
let last: Estimate | null = null;
let restored: Promise<void> | null = null;
const KEY = 'whereabouts';
const today = (t = Date.now()) => new Date(t).toDateString();

export const lastEstimate = (now = Date.now()) => current(last, now);

/** Loads the location saved earlier today (once per app start); then read it with lastEstimate(). */
export function restoreWhereabouts(): Promise<void> {
  restored ??= storage.get(KEY)
    .then(raw => {
      const saved = raw ? (JSON.parse(raw) as Estimate) : null;
      if (!last && saved && today(saved.at) === today()) last = saved;
    })
    .catch(() => undefined);
  return restored;
}

function save(next: Estimate | null, token: string | null, alertActive: boolean): Estimate | null {
  last = next;
  storage.set(KEY, JSON.stringify(next)).catch(() => undefined);
  if (next) report(next, token, alertActive);
  return next;
}

/**
 * Applies a new observation and returns the resulting estimate. While an alert is active the server gets a
 * location event (Safety Monitor's "last known location"); otherwise nothing leaves the phone (RA 10173).
 */
export function updateWhereabouts(obs: Observation, token: string | null, alertActive: boolean): Estimate {
  const next = observe(last, obs, Date.now());
  return next === last ? next : save(next, token, alertActive)!;
}

/** Uses the class in session as the starting point, no tap needed (see startForClass). */
export function applyClass(cls: ClassNow | null, token: string | null, alertActive: boolean): Estimate | null {
  const next = startForClass(last, cls, Date.now());
  return next === last ? next : save(next, token, alertActive);
}

/**
 * The barometer saw the user change floors (+up/−down). Until they confirm their room, they are assumed to be at the
 * stairwell landing on the new floor nearest to where they were, so the route keeps working.
 */
export function moveFloors(snap: CampusSnapshot, floors: number, token: string | null, alertActive: boolean): Estimate | null {
  const prev = lastEstimate();
  if (!prev?.building || prev.floor === undefined) return prev;
  const target = prev.floor + floors;
  if (!snap.buildings.find(b => b.id === prev.building)?.floors.some(f => f.level === target)) return prev; // off the map: ignore
  const from = snap.nodes.find(n => n.id === routeOrigin(snap, prev));
  const landing = snap.nodes
    .filter(n => n.building === prev.building && n.level === target && n.type === 'stairwell')
    .sort((a, b) => (from ? Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y) : 0))[0];
  return save({ ...applyFloorChange(prev, floors, Date.now()), nodeId: landing?.id, confidence: 'likely' }, token, alertActive);
}

function report(e: Estimate, token: string | null, alertActive: boolean) {
  if (!token || !alertActive) return;
  api('/api/location', {
    method: 'POST', token,
    body: { source: e.source, confidence: e.confidence, node_id: e.nodeId ?? null, room_id: e.roomId ?? null, building_id: e.building ?? null, level: e.floor ?? null },
  }).catch(() => undefined);
}

/** Graph node for the last known location, if any. */
export const lastNode = (snap: CampusSnapshot | null) => (snap ? routeOrigin(snap, lastEstimate()) : null);

export function forgetWhereabouts() {
  last = null;
  restored = null;
  storage.remove(KEY).catch(() => undefined);
}
