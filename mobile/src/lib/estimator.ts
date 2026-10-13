import type { CampusNode, CampusSnapshot } from '@evacuai/routing';

/**
 * Where the user is, from phone-only sources (spec §4). Pure functions: the screen keeps the Estimate in state.
 * Priority: QR scan > manual pick > class schedule > barometer floor change.
 */
export type Source = 'qr' | 'manual' | 'schedule' | 'barometer' | 'gps';
export type Confidence = 'exact' | 'likely' | 'unknown';

export type Estimate = {
  nodeId?: string;
  roomId?: string;
  building?: string;
  floor?: number;
  source: Source;
  confidence: Confidence;
  at: number; // ms
};

export type Observation = { source: 'qr' | 'manual' | 'schedule'; nodeId?: string; roomId?: string; building: string; floor: number };

export const EXACT_FOR_MS = 10 * 60_000;
const PRIORITY: Record<Source, number> = { qr: 4, manual: 4, schedule: 2, barometer: 1, gps: 1 };

export function observe(prev: Estimate | null, obs: Observation, now: number): Estimate {
  const next: Estimate = {
    nodeId: obs.nodeId, roomId: obs.roomId, building: obs.building, floor: obs.floor,
    source: obs.source, confidence: obs.source === 'schedule' ? 'likely' : 'exact', at: now,
  };
  const live = prev ? current(prev, now) : null;
  // A weaker source never overrides a stronger, still-trusted one (e.g. the schedule after a QR scan).
  if (live && live.confidence !== 'unknown' && PRIORITY[obs.source] < PRIORITY[live.source]) return prev!;
  return next;
}

export type ClassNow = { roomId: string; building: string; floor: number; startsAt: number /* ms */ };

/**
 * Starting point when a class is in session, with no tap needed: the class room, unless the user scanned, picked
 * or climbed stairs since that class started (then they moved and their own reading wins). A reading from before
 * the class began (e.g. this morning's scan) gives way to the new class.
 */
export function startForClass(prev: Estimate | null, cls: ClassNow | null, now: number): Estimate | null {
  if (!cls) return prev;
  if (prev && prev.source !== 'schedule' && prev.at >= cls.startsAt) return prev;
  if (prev?.source === 'schedule' && prev.roomId === cls.roomId) return prev;
  return { roomId: cls.roomId, building: cls.building, floor: cls.floor, source: 'schedule', confidence: 'likely', at: now };
}

/** Applies time decay: exact readings become "likely" after 10 minutes. */
export function current(e: Estimate | null, now: number): Estimate | null {
  if (!e) return null;
  return e.confidence === 'exact' && now - e.at > EXACT_FOR_MS ? { ...e, confidence: 'likely' } : e;
}

/** Barometer detected n floors (+up/−down): same building, new floor, room unknown until the user confirms. */
export function applyFloorChange(e: Estimate, floors: number, now: number): Estimate {
  return { building: e.building, floor: (e.floor ?? 0) + floors, source: 'barometer', confidence: e.confidence, at: now };
}

/** Graph node to route from: the scanned node, or the picked room's own node. Null = ask the user. */
export function routeOrigin(snap: CampusSnapshot, e: Estimate | null): string | null {
  if (!e) return null;
  if (e.nodeId && snap.nodes.some(n => n.id === e.nodeId)) return e.nodeId;
  if (e.roomId) return snap.nodes.find(n => n.room_id === e.roomId && n.type !== 'hallway')?.id ?? null;
  return null;
}

/** Sticker payload is exactly evacuai://q/<qr_id>; anything else is rejected. */
export function parseQr(data: string): string | null {
  const m = /^evacuai:\/\/q\/([0-9A-Z]{4,16})$/.exec(data.trim());
  return m ? m[1] : null;
}

export function nodeForQr(snap: CampusSnapshot, qrId: string): CampusNode | null {
  return snap.nodes.find(n => n.qr_id === qrId) ?? null;
}
