import { loadDemoSnapshot } from './helpers';
import { observe, current, routeOrigin, parseQr, nodeForQr, applyFloorChange, startForClass, type Estimate } from '@/lib/estimator';

const snap = loadDemoSnapshot();
const T0 = Date.parse('2026-10-14T08:00:00+08:00');
const min = (n: number) => n * 60_000;

test('a QR scan gives an exact node', () => {
  const e = observe(null, { source: 'qr', nodeId: 'DEMO/2/S2', building: 'DEMO', floor: 2 }, T0);
  expect(e).toMatchObject({ nodeId: 'DEMO/2/S2', confidence: 'exact', source: 'qr' });
  expect(routeOrigin(snap, e)).toBe('DEMO/2/S2');
});

test('a picked room routes from that room', () => {
  const e = observe(null, { source: 'manual', roomId: 'DEMO/2/R201', building: 'DEMO', floor: 2 }, T0);
  expect(e.confidence).toBe('exact');
  expect(routeOrigin(snap, e)).toBe('DEMO/2/R201');
});

test('the class schedule is only a likely guess and never overrides a scan', () => {
  const guess = observe(null, { source: 'schedule', roomId: 'DEMO/1/R101', building: 'DEMO', floor: 1 }, T0);
  expect(guess.confidence).toBe('likely');
  const scanned = observe(guess, { source: 'qr', nodeId: 'DEMO/2/S2', building: 'DEMO', floor: 2 }, T0 + min(1));
  const again = observe(scanned, { source: 'schedule', roomId: 'DEMO/1/R101', building: 'DEMO', floor: 1 }, T0 + min(2));
  expect(again.nodeId).toBe('DEMO/2/S2');
});

test('exact confidence decays to likely after 10 minutes', () => {
  const e = observe(null, { source: 'qr', nodeId: 'DEMO/2/S2', building: 'DEMO', floor: 2 }, T0);
  expect(current(e, T0 + min(9))!.confidence).toBe('exact');
  expect(current(e, T0 + min(11))!.confidence).toBe('likely');
});

test('a floor change keeps the building, sets the floor and asks for the room again', () => {
  const e = observe(null, { source: 'qr', nodeId: 'DEMO/2/S2', building: 'DEMO', floor: 2 }, T0);
  const moved = applyFloorChange(e, -1, T0 + min(1));
  expect(moved).toMatchObject({ building: 'DEMO', floor: 1, source: 'barometer' });
  expect(moved.nodeId).toBeUndefined();
  expect(routeOrigin(snap, moved)).toBeNull();
});

test('QR payloads are parsed strictly and resolved through the snapshot', () => {
  expect(parseQr('evacuai://q/AB12CD34')).toBe('AB12CD34');
  expect(parseQr('https://evil.example/q/AB12CD34')).toBeNull();
  expect(parseQr('evacuai://q/../x')).toBeNull();
  const withQr = { ...snap, nodes: snap.nodes.map(n => (n.id === 'DEMO/1/X1' ? { ...n, qr_id: 'AB12CD34' } : n)) };
  expect(nodeForQr(withQr, 'AB12CD34')?.id).toBe('DEMO/1/X1');
  expect(nodeForQr(withQr, 'FFFFFFFF')).toBeNull();
});

test('nothing known means no origin', () => {
  expect(routeOrigin(snap, null as Estimate | null)).toBeNull();
});

test('the current class is the starting point with no tap, unless the user located themselves since it began', () => {
  const cls = { roomId: 'DEMO/2/R201', building: 'DEMO', floor: 2, startsAt: T0 };
  expect(startForClass(null, cls, T0 + min(5))).toMatchObject({ roomId: 'DEMO/2/R201', source: 'schedule', confidence: 'likely' });

  const scanDuringClass: Estimate = { nodeId: 'DEMO/1/S1', building: 'DEMO', floor: 1, source: 'qr', confidence: 'exact', at: T0 + min(10) };
  expect(startForClass(scanDuringClass, cls, T0 + min(40))).toBe(scanDuringClass); // even after the 10-minute decay

  const scanThisMorning: Estimate = { ...scanDuringClass, at: T0 - min(90) };
  expect(startForClass(scanThisMorning, cls, T0 + min(5))?.source).toBe('schedule'); // new class started since: they moved

  const already = startForClass(null, cls, T0 + min(5))!;
  expect(startForClass(already, cls, T0 + min(20))).toBe(already); // stable: no churn every refresh
  expect(startForClass(scanDuringClass, null, T0)).toBe(scanDuringClass); // no class: keep what we have
});

