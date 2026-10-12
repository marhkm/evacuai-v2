export interface PressureSample { t: number /* ms */; hPa: number }
export interface FloorChange { t: number; floors: number /* +up, −down */ }

// ponytail: thresholds are calibration knobs; tune from recorded traces (Plan 3)
export const HPA_PER_M = 0.12;
export const SMOOTH_MS = 5000; // trailing moving average, also the warm-up after start/gap
export const RATE_LAG_MS = 3000; // slope measured over this span of the smoothed signal
export const RATE_MIN = 0.008; // hPa/s — stairs ≈ 0.028, weather drift ≈ 0.0003
export const SUSTAIN_MS = 3000; // quiet time that ends a movement episode
export const MIN_EPISODE = 0.2; // × floorDelta; smaller episodes are noise
export const TRIGGER = 0.6; // × floorDelta of accumulated movement before a change is reported
export const GAP_MS = 10000;

/**
 * Rate-gated: only intervals where pressure changes fast (people moving on stairs or in a lift) count.
 * Each movement episode adds its net change to an accumulator; whole floors are reported from it.
 * Slow drift never moves fast enough to count; a half-floor landing pause stays in the accumulator
 * until the person continues (→ +1) or turns back (→ 0).
 */
export function detectFloorChanges(samples: PressureSample[], opts: { floorHeight_m: number }): FloorChange[] {
  const fd = opts.floorHeight_m * HPA_PER_M;
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const out: FloorChange[] = [];

  let win: PressureSample[] = [];
  let winSum = 0;
  let hist: { t: number; s: number }[] = [];
  let since = 0; // start of the current gap-free run
  let acc = 0; // accumulated net movement, hPa (positive = up)
  let episode: { start: number; quietSince?: number } | undefined;
  let lastT: number | undefined;

  for (const p of sorted) {
    if (lastT === undefined || p.t - lastT > GAP_MS) {
      win = []; winSum = 0; hist = []; since = p.t; acc = 0; episode = undefined;
    }
    lastT = p.t;

    win.push(p); winSum += p.hPa;
    while (win[0].t <= p.t - SMOOTH_MS) winSum -= win.shift()!.hPa;
    if (p.t - since < SMOOTH_MS) continue; // warm-up: a single bad first reading must not set the level
    const s = winSum / win.length;

    hist.push({ t: p.t, s });
    while (hist.length > 1 && hist[1].t <= p.t - RATE_LAG_MS) hist.shift();
    const lag = hist[0];
    if (p.t - lag.t < RATE_LAG_MS) continue;
    const moving = Math.abs((lag.s - s) / ((p.t - lag.t) / 1000)) >= RATE_MIN;

    if (!episode) {
      if (moving) episode = { start: lag.s };
      continue;
    }
    if (moving) { episode.quietSince = undefined; continue; }
    episode.quietSince ??= p.t;
    if (p.t - episode.quietSince < SUSTAIN_MS) continue;

    const delta = episode.start - s;
    episode = undefined;
    if (Math.abs(delta) < MIN_EPISODE * fd) continue;
    acc += delta;
    if (Math.abs(acc) >= TRIGGER * fd) {
      const floors = Math.sign(acc) * Math.max(1, Math.round(Math.abs(acc) / fd));
      out.push({ t: p.t, floors });
      acc -= floors * fd;
    }
  }
  return out;
}
