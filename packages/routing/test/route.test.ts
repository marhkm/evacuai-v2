import fc from 'fast-check';
import { findRoute } from '../src/route';
import { HAZARDS } from '../src/types';
import { clone, loadDemo } from './helpers/demo';

const edge = (s: ReturnType<typeof loadDemo>, id: string) => s.edges.find(e => e.id === id)!;
const node = (s: ReturnType<typeof loadDemo>, id: string) => s.nodes.find(n => n.id === id)!;

test('earthquake from R201 → X1 with glass ×3', () => {
  expect(findRoute(loadDemo(), 'DEMO/2/R201', 'earthquake')).toEqual({ ok: true, route: {
    nodeIds: ['DEMO/2/R201', 'DEMO/2/C3', 'DEMO/2/C4', 'DEMO/2/S2', 'DEMO/1/S1', 'DEMO/1/C2', 'DEMO/1/C1', 'DEMO/1/X1'],
    distance_m: 46, cost: 66, destinationId: 'DEMO/1/X1' } });
});

test('flood goes up to C4', () => {
  const r = findRoute(loadDemo(), 'DEMO/1/R101', 'flood');
  expect(r.ok && r.route.nodeIds).toEqual(['DEMO/1/R101', 'DEMO/1/C1', 'DEMO/1/C2', 'DEMO/1/S1', 'DEMO/2/S2', 'DEMO/2/C4']);
  expect(r.ok && r.route.distance_m).toBe(31);
});

test('blocked only path → no_safe_route (elevator never used)', () => {
  const s = clone(loadDemo());
  edge(s, 'DEMO/1/C1->DEMO/1/C2').status = 'blocked';
  expect(findRoute(s, 'DEMO/2/R201', 'earthquake')).toEqual({ ok: false, reason: 'no_safe_route' });
});

test('unknown origin', () => {
  expect(findRoute(loadDemo(), 'DEMO/9/NOPE', 'fire')).toEqual({ ok: false, reason: 'unknown_origin' });
});

test('origin already safe → single-node route', () => {
  const r = findRoute(loadDemo(), 'DEMO/1/X1', 'fire');
  expect(r.ok && r.route).toMatchObject({ nodeIds: ['DEMO/1/X1'], distance_m: 0, cost: 0 });
});

test('congested multiplies cost by 2.5', () => {
  const s = clone(loadDemo());
  edge(s, 'DEMO/1/C1->DEMO/1/X1').status = 'congested';
  const r = findRoute(s, 'DEMO/1/C1', 'fire');
  expect(r.ok && r.route.cost).toBe(12.5);
});

test('hazard room is avoided, even as destination', () => {
  const s = clone(loadDemo());
  s.rooms.push({ id: 'DEMO/1/X1room', building: 'DEMO', level: 1, name: 'Exit', type: 'exit', polygon: [[0, 5], [1, 5], [1, 7], [0, 5]] });
  node(s, 'DEMO/1/X1').room_id = 'DEMO/1/X1room';
  s.hazardRoomIds = ['DEMO/1/X1room'];
  expect(findRoute(s, 'DEMO/1/C1', 'fire')).toEqual({ ok: false, reason: 'no_safe_route' }); // AP only via X1
});

test('full assembly point adds penalty; missing capacity never NaN', () => {
  const s = clone(loadDemo());
  node(s, 'DEMO/1/X1').safe_for = [];
  let r = findRoute(s, 'DEMO/1/C1', 'fire');
  expect(r.ok && r.route.cost).toBe(15); // C1–X1 5 + X1–AP 10, no capacity fields
  Object.assign(node(s, 'DEMO/1/AP'), { capacity: 100, occupancy: 100 });
  r = findRoute(s, 'DEMO/1/C1', 'fire');
  expect(r.ok && r.route.cost).toBe(115);
});

test('directed edge is one-way', () => {
  const s = clone(loadDemo());
  edge(s, 'DEMO/1/C1->DEMO/1/X1').bidirectional = false;
  expect(findRoute(s, 'DEMO/1/AP', 'flood')).toEqual({ ok: false, reason: 'no_safe_route' }); // X1→C1 gone
});

test('property: never uses a blocked edge and always ends safe', () => {
  const base = loadDemo();
  const origins = base.nodes.filter(n => n.type !== 'elevator').map(n => n.id);
  fc.assert(fc.property(
    fc.subarray(base.edges.map(e => e.id)),
    fc.constantFrom(...HAZARDS),
    fc.constantFrom(...origins),
    (blocked, hazard, origin) => {
      const s = clone(base);
      for (const e of s.edges) if (blocked.includes(e.id)) e.status = 'blocked';
      const r = findRoute(s, origin, hazard);
      if (!r.ok) return;
      const ids = r.route.nodeIds;
      for (let i = 1; i < ids.length; i++) {
        const used = s.edges.find(e => (e.from === ids[i - 1] && e.to === ids[i]) || (e.bidirectional && e.from === ids[i] && e.to === ids[i - 1]))!;
        expect(used.status).not.toBe('blocked');
      }
      expect(s.nodes.find(n => n.id === ids.at(-1))!.safe_for).toContain(hazard);
    },
  ));
});

// ── final-review fixes ──
const inRoom = (s: ReturnType<typeof loadDemo>, roomId: string, nodeIds: string[]) => {
  s.rooms.push({ id: roomId, building: 'DEMO', level: 1, name: roomId, type: 'room', polygon: [[0, 0], [1, 0], [1, 1], [0, 0]] });
  for (const id of nodeIds) node(s, id).room_id = roomId;
};

test('C1: origin inside a hazard room never gets "stay here"', () => {
  const s = clone(loadDemo());
  inRoom(s, 'DEMO/1/X1room', ['DEMO/1/X1']);
  s.hazardRoomIds = ['DEMO/1/X1room'];
  const r = findRoute(s, 'DEMO/1/X1', 'fire');
  expect(r.ok && r.route.destinationId).toBe('DEMO/1/AP');
});

test('C2: impassable flags survive a JSON round-trip', () => {
  const s = clone(loadDemo());
  edge(s, 'DEMO/1/C1->DEMO/1/X1').flags = ['smoke'];
  const wire = JSON.parse(JSON.stringify(s));
  expect(JSON.stringify(s.weights)).not.toContain('null');
  expect(findRoute(wire, 'DEMO/1/C1', 'fire')).toEqual({ ok: false, reason: 'no_safe_route' });
});

test('C2: a null weight from the wire fails closed', () => {
  const s = JSON.parse(JSON.stringify(loadDemo()));
  s.weights.flags.fire = { smoke: null };
  s.edges.find((e: { id: string }) => e.id === 'DEMO/1/C1->DEMO/1/X1').flags = ['smoke'];
  expect(findRoute(s, 'DEMO/1/C1', 'fire')).toEqual({ ok: false, reason: 'no_safe_route' });
});

test('C2: JSON-shaped gaps never throw', () => {
  const s = JSON.parse(JSON.stringify(loadDemo()));
  s.weights.flags = {};
  s.weights.blockFlags = {};
  s.nodes[0].safe_for = null;
  expect(() => findRoute(s, 'DEMO/1/C1', 'fire')).not.toThrow();
});

test('I3: hazard on a shared room (corridor) blocks passage but lets its occupants leave', () => {
  const s = clone(loadDemo());
  inRoom(s, 'DEMO/1/Hall', ['DEMO/1/C1', 'DEMO/1/C2']);
  s.hazardRoomIds = ['DEMO/1/Hall'];
  expect(findRoute(s, 'DEMO/1/R101', 'fire')).toEqual({ ok: false, reason: 'no_safe_route' });
  const r = findRoute(s, 'DEMO/1/C2', 'fire');
  expect(r.ok && r.route.nodeIds).toEqual(['DEMO/1/C2', 'DEMO/1/C1', 'DEMO/1/X1']);
});
