import * as Location from 'expo-location';

import { api } from '@/lib/api';
import { lastEstimate, restoreWhereabouts } from '@/lib/whereabouts';

export type SosSource = 'qr' | 'manual' | 'schedule' | 'gps' | 'estimate';
export type SentSos = { id: number; location_source?: SosSource | null };

const CLASS_STILL_LIKELY_MS = 2 * 3_600_000; // a class room from the last 2 hours is a fair guess; older is not

/** What the phone knows, as the SOS body: an exact scan or pick as fact, anything older or guessed as an estimate. */
function placeBody() {
  const e = lastEstimate();
  const none = { node_id: null, room_id: null, building_id: null, level: null, location_source: null };
  // The class now is the server's call (it knows the schedule); a recent class room goes as an estimate, an old one not at all.
  if (!e || (e.source === 'schedule' && Date.now() - e.at > CLASS_STILL_LIKELY_MS) || (!e.nodeId && !e.roomId && !e.building)) return none;
  const exact = (e.source === 'qr' || e.source === 'manual') && e.confidence === 'exact';
  return {
    node_id: e.nodeId ?? null, room_id: e.roomId ?? null, building_id: e.building ?? null, level: e.floor ?? null,
    location_source: exact ? e.source : 'estimate',
  };
}

/** One GPS fix, 3 s at most, after the SOS is out: the server turns it into a building (and forgets the coordinates). */
async function addGps(id: number, token: string) {
  if (!(await Location.requestForegroundPermissionsAsync()).granted) return;
  const fix = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
  ]);
  if (!fix?.coords) return;
  await api(`/api/sos/${id}/location`, { method: 'PATCH', token, body: { lat: fix.coords.latitude, lng: fix.coords.longitude, accuracy: fix.coords.accuracy ?? 999 } });
}

/**
 * Sends the SOS at once (the only wait is reading today's saved place from this phone), then adds GPS in the
 * background when the server has nothing better. Pressing again while one is open returns the open one.
 */
export async function sendSos(token: string): Promise<SentSos> {
  await restoreWhereabouts();
  const { sos } = await api<{ sos: SentSos }>('/api/sos', { method: 'POST', token, body: placeBody() });
  if (!sos.location_source || sos.location_source === 'estimate') addGps(sos.id, token).catch(() => undefined);
  return sos;
}
