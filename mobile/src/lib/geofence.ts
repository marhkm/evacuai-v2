import type { CampusSnapshot } from '@evacuai/routing';
import * as Location from 'expo-location';

const EARTH_M = 6_371_000;

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/** The assembly point whose radius contains this position (nearest first), or null. Points without coordinates are skipped. */
export function assemblyPointAt(snap: CampusSnapshot, pos: { lat: number; lng: number; accuracy?: number | null }): { nodeId: string; distance_m: number } | null {
  const slack = Math.min(pos.accuracy ?? 0, 30); // allow for GPS error, but never more than 30 m
  return snap.assemblyPoints
    .filter((ap): ap is typeof ap & { lat: number; lng: number } => ap.lat !== null && ap.lng !== null)
    .map(ap => ({ nodeId: ap.node_id, distance_m: distanceM(pos, ap), radius: ap.radius_m }))
    .filter(ap => ap.distance_m <= ap.radius + slack)
    .sort((a, b) => a.distance_m - b.distance_m)
    .map(({ nodeId, distance_m }) => ({ nodeId, distance_m }))[0] ?? null;
}

/**
 * One GPS reading, taken only when the user opens check-in during an alert (never in the background).
 * Null when the campus has no assembly-point coordinates, permission is refused, or GPS is unavailable.
 */
export async function nearbyAssemblyPoint(snap: CampusSnapshot): Promise<{ nodeId: string; distance_m: number } | null> {
  if (!snap.assemblyPoints.some(ap => ap.lat !== null && ap.lng !== null)) return null; // not surveyed yet: don't ask for permission
  try {
    if (!(await Location.requestForegroundPermissionsAsync()).granted) return null;
    const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return assemblyPointAt(snap, { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
  } catch {
    return null;
  }
}
