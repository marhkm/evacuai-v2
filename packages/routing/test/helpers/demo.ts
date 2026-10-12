import { loadCampus } from '../../src/load';
import type { CampusSnapshot } from '../../src/types';

export const loadDemo = (): CampusSnapshot => loadCampus('campus-data/demo');
export const clone = <T>(x: T): T => structuredClone(x);

export interface TraceOpts {
  seconds: number;
  hz: number;
  steps?: { atS: number; floors: number; durS: number }[];
  driftHpaPerHour?: number;
  noise?: number;
  seed?: number;
  startS?: number;
  offsetHpa?: number;
}

// Deterministic synthetic barometer trace: 1010 hPa base, −floors × 3.5 m × 0.12 hPa/m per step.
export function trace(o: TraceOpts): { t: number; hPa: number }[] {
  let seed = o.seed ?? 1;
  const rand = () => { // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
  const out: { t: number; hPa: number }[] = [];
  const start = o.startS ?? 0;
  for (let i = 0; i <= o.seconds * o.hz; i++) {
    const s = start + i / o.hz;
    let p = 1010 + (o.offsetHpa ?? 0) + ((o.driftHpaPerHour ?? 0) * s) / 3600;
    for (const st of o.steps ?? []) p -= st.floors * 3.5 * 0.12 * Math.min(1, Math.max(0, (s - st.atS) / st.durS));
    out.push({ t: Math.round(s * 1000), hPa: p + (o.noise ?? 0) * gauss() });
  }
  return out;
}
