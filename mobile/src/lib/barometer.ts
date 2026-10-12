import { detectFloorChanges, type PressureSample } from '@evacuai/routing';
import { Barometer } from 'expo-sensors';

const WINDOW_MS = 120_000; // detector looks back 2 min; older samples are dropped
const INTERVAL_MS = 200;

/** Raw pressure stream (hPa). Resolves to null when the phone has no barometer (and on the web build). */
export async function watchPressure(onSample: (s: PressureSample) => void, now = Date.now): Promise<(() => void) | null> {
  if (!(await Barometer.isAvailableAsync().catch(() => false))) return null;
  Barometer.setUpdateInterval(INTERVAL_MS);
  const sub = Barometer.addListener(({ pressure }) => onSample({ t: now(), hPa: pressure }));
  return () => sub.remove();
}

/**
 * Live floor-change detection (spec §4): feeds a rolling window of pressure samples to the shared detector and reports
 * each new change once, as +n (up) / −n (down) floors. Returns an unsubscribe function (no-op without a barometer).
 */
export function watchFloorChanges(floorHeight_m: number, onChange: (floors: number) => void, now = Date.now): () => void {
  const samples: PressureSample[] = [];
  let reportedUntil = now();
  let stop: (() => void) | null = null;
  let cancelled = false;

  watchPressure(s => {
    samples.push(s);
    while (samples.length && samples[0].t < s.t - WINDOW_MS) samples.shift();
    for (const c of detectFloorChanges(samples, { floorHeight_m })) {
      if (c.t <= reportedUntil) continue;
      reportedUntil = c.t;
      onChange(c.floors);
    }
  }, now).then(unsubscribe => (cancelled ? unsubscribe?.() : (stop = unsubscribe)));

  return () => { cancelled = true; stop?.(); };
}
