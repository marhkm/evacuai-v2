import { watchFloorChanges } from '@/lib/barometer';
import { forgetWhereabouts, moveFloors, updateWhereabouts } from '@/lib/whereabouts';

import { loadDemoSnapshot } from './helpers';

const mockSensor: { emit?: (r: { pressure: number }) => void; available: boolean } = { available: true };
jest.mock('expo-sensors', () => ({
  Barometer: {
    isAvailableAsync: async () => mockSensor.available,
    setUpdateInterval: () => undefined,
    addListener: (cb: (r: { pressure: number }) => void) => { mockSensor.emit = cb; return { remove: () => { mockSensor.emit = undefined; } }; },
  },
}));

/** Feeds a 200 ms pressure trace: 10 s still, a climb of `floors` × 3.5 m at stair speed, then 10 s still. */
async function walk(floors: number, clock: { t: number; hPa: number }) {
  const step = 200;
  const hPaPerFloor = 3.5 * 0.12;
  const climbMs = Math.abs(floors) * 15_000;
  const feed = (ms: number, dp: number) => {
    for (let t = 0; t < ms; t += step) { clock.t += step; clock.hPa += dp; mockSensor.emit!({ pressure: clock.hPa }); }
  };
  feed(10_000, 0);
  feed(climbMs, (-Math.sign(floors) * hPaPerFloor * Math.abs(floors)) / (climbMs / step)); // pressure falls going up
  feed(10_000, 0);
}

test('reports each stair climb or descent once', async () => {
  const clock = { t: 1_000_000, hPa: 1010 };
  const changes: number[] = [];
  const stop = watchFloorChanges(3.5, f => changes.push(f), () => clock.t);
  await new Promise(r => setTimeout(r, 0)); // sensor availability check
  await walk(1, clock);
  await walk(-2, clock);
  stop();
  expect(changes).toEqual([1, -2]);
  expect(mockSensor.emit).toBeUndefined(); // unsubscribed
});

test('does nothing on phones without a barometer', async () => {
  mockSensor.available = false;
  const stop = watchFloorChanges(3.5, () => { throw new Error('no events expected'); });
  await new Promise(r => setTimeout(r, 0));
  expect(mockSensor.emit).toBeUndefined();
  stop();
  mockSensor.available = true;
});

test('a floor change moves the start to the nearest stair landing on the new floor', () => {
  const snap = loadDemoSnapshot();
  forgetWhereabouts();
  expect(moveFloors(snap, 1, null, false)).toBeNull(); // nothing known yet

  updateWhereabouts({ source: 'manual', roomId: 'DEMO/1/R101', building: 'DEMO', floor: 1 }, null, false);
  const up = moveFloors(snap, 1, null, false)!;
  expect(up).toMatchObject({ building: 'DEMO', floor: 2, nodeId: 'DEMO/2/S2', source: 'barometer', confidence: 'likely' });

  expect(moveFloors(snap, 1, null, false)).toBe(up); // there is no third floor: ignored
});
