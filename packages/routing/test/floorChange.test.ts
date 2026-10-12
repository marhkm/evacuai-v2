import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectFloorChanges, type FloorChange } from '../src/floorChange';
import { trace } from './helpers/demo';

const opts = { floorHeight_m: 3.5 };
const sum = (c: FloorChange[]) => c.reduce((a, x) => a + x.floors, 0);
const run = (t: ReturnType<typeof trace>) => detectFloorChanges(t, opts);

test('stairs up 1 floor over 15 s', () => {
  expect(sum(run(trace({ seconds: 60, hz: 5, steps: [{ atS: 10, floors: 1, durS: 15 }], noise: 0.03 })))).toBe(1);
});
test('up 2 floors over 30 s', () => {
  expect(sum(run(trace({ seconds: 90, hz: 5, steps: [{ atS: 10, floors: 2, durS: 30 }], noise: 0.03 })))).toBe(2);
});
test('down 1 floor', () => {
  expect(sum(run(trace({ seconds: 60, hz: 5, steps: [{ atS: 10, floors: -1, durS: 15 }], noise: 0.03 })))).toBe(-1);
});
test('elevator up 3 floors over 12 s', () => {
  expect(sum(run(trace({ seconds: 60, hz: 5, steps: [{ atS: 10, floors: 3, durS: 12 }], noise: 0.03 })))).toBe(3);
});
test('60 min of 1 hPa/h drift → no change', () => {
  expect(run(trace({ seconds: 3600, hz: 5, driftHpaPerHour: 1, noise: 0.03 }))).toHaveLength(0);
});
test('10 min of noise → no change', () => {
  expect(run(trace({ seconds: 600, hz: 5, noise: 0.05, seed: 7 }))).toHaveLength(0);
});
test('empty input → []', () => {
  expect(detectFloorChanges([], opts)).toEqual([]);
});
test('120 s gap with +0.5 hPa offset → no change', () => {
  const before = trace({ seconds: 60, hz: 5, noise: 0.03 });
  const after = trace({ seconds: 60, hz: 5, noise: 0.03, startS: 180, offsetHpa: 0.5, seed: 3 });
  expect(run([...before, ...after])).toHaveLength(0);
});
test('same climb at 25 Hz and 5 Hz gives the same sum', () => {
  const step = [{ atS: 10, floors: 1, durS: 15 }];
  const at5 = sum(run(trace({ seconds: 60, hz: 5, steps: step, noise: 0.03 })));
  const at25 = sum(run(trace({ seconds: 60, hz: 25, steps: step, noise: 0.03 })));
  expect(at25).toBe(at5);
  expect(at5).toBe(1);
});
test('unsorted samples are handled', () => {
  const t = trace({ seconds: 60, hz: 5, steps: [{ atS: 10, floors: 1, durS: 15 }] }).reverse();
  expect(sum(run(t))).toBe(1);
});

const dir = join(__dirname, 'fixtures', 'traces');
const csvs = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.csv')) : [];
test('trace fixtures dir present', () => {
  expect(existsSync(dir)).toBe(true);
});
for (const file of csvs) {
  test(`recorded trace ${file}`, () => {
    const expected = Number(/__floors_(-?\d+)\.csv$/.exec(file)?.[1]);
    const rows = readFileSync(join(dir, file), 'utf8').trim().split(/\r?\n/).slice(1);
    const samples = rows.map(r => { const [t, hPa] = r.split(',').map(Number); return { t, hPa }; });
    expect(sum(run(samples))).toBe(expected);
  });
}

// ── final-review fixes ──
test('I4: a bad first sample is not a floor change', () => {
  const t = trace({ seconds: 120, hz: 5, noise: 0.03 });
  t[0].hPa += 0.4;
  expect(run(t)).toHaveLength(0);
});
test('I4: a bad sample right after a gap is not a floor change', () => {
  const after = trace({ seconds: 60, hz: 5, noise: 0.03, startS: 180, seed: 5 });
  after[0].hPa -= 0.5;
  expect(run([...trace({ seconds: 60, hz: 5, noise: 0.03 }), ...after])).toHaveLength(0);
});
test('I5: half-floor landing pause with drift → no change', () => {
  expect(run(trace({ seconds: 300, hz: 5, steps: [{ atS: 10, floors: 0.5, durS: 8 }], driftHpaPerHour: 1, noise: 0.03 }))).toHaveLength(0);
});
test('I5: landing pause then continue up → +1', () => {
  const steps = [{ atS: 10, floors: 0.5, durS: 8 }, { atS: 80, floors: 0.5, durS: 8 }];
  expect(sum(run(trace({ seconds: 150, hz: 5, steps, noise: 0.03 })))).toBe(1);
});
test('I5: landing then turn back → no change (50 seeds, with and without drift)', () => {
  let falseChanges = 0;
  for (let seed = 1; seed <= 50; seed++) {
    for (const drift of [0, 1]) {
      const steps = [{ atS: 10, floors: 0.5, durS: 8 }, { atS: 60, floors: -0.5, durS: 8 }];
      falseChanges += run(trace({ seconds: 200, hz: 5, steps, noise: 0.03, driftHpaPerHour: drift, seed })).length;
    }
  }
  expect(falseChanges).toBe(0);
});
