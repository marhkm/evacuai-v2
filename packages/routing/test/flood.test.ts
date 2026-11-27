import { findRoute } from '../src/route';
import { DEFAULT_WEIGHTS, type CampusNode, type CampusSnapshot, type Edge } from '../src/types';

// One building: a ground floor with a room, a hallway, an exit to an open ground, and stairs up to a flood-safe room.
// Normally the open ground is nearer than the safe room upstairs, from either floor.
const node = (id: string, level: number, type: CampusNode['type'], safe_for: CampusNode['safe_for'] = []): CampusNode =>
  ({ id: `B/${level}/${id}`, building: 'B', level, type, x: 0, y: 0, safe_for });
const edge = (from: string, to: string, distance_m: number): Edge =>
  ({ id: `${from}->${to}`, from, to, type: 'corridor', distance_m, bidirectional: true, flags: [], status: 'open' });
const campus = (extra: Partial<CampusSnapshot> = {}): CampusSnapshot => ({
  name: 'T', buildings: [{ id: 'B', name: 'B', origin: null, rotation_deg: 0, footprint: [], floors: [{ level: 1, name: 'Ground', elevation_m: 0, height_m: 3.5 }, { level: 2, name: 'Second', elevation_m: 3.5, height_m: 3.5 }] }],
  rooms: [],
  nodes: [node('A', 1, 'room'), node('H', 1, 'hallway'), node('X', 1, 'exit'), node('OPEN', 1, 'assembly_point', ['flood', 'fire', 'earthquake']),
    node('S1', 1, 'stairwell'), node('S2', 2, 'stairwell'), node('U', 2, 'room', ['flood']), node('R2', 2, 'room')],
  edges: [edge('B/1/A', 'B/1/H', 2), edge('B/1/H', 'B/1/X', 3), edge('B/1/X', 'B/1/OPEN', 5), edge('B/1/H', 'B/1/S1', 5),
    edge('B/1/S1', 'B/2/S2', 7), edge('B/2/S2', 'B/2/U', 30), edge('B/2/S2', 'B/2/R2', 2)],
  assemblyPoints: [], hazardRoomIds: [], weights: DEFAULT_WEIGHTS, ...extra,
});
const end = (snap: CampusSnapshot, from: string) => { const r = findRoute(snap, from, 'flood'); return r.ok ? r.route.destinationId : r.reason; };

test('without a reported flood, the nearest safe place wins (the open ground)', () => {
  expect(end(campus(), 'B/1/A')).toBe('B/1/OPEN');
});

test('a flooded open ground is never a destination: the route goes to the next safe place instead', () => {
  expect(end(campus({ hazardNodeIds: ['B/1/OPEN'] }), 'B/1/A')).toBe('B/2/U');
});

test('a flooded floor is never crossed or ended on, but people on it can still leave it', () => {
  const snap = campus({ floodedFloors: [{ building: 'B', level: 1 }] });
  // From upstairs (the second floor has a flood-safe room, so it is above the flood): stays up, never goes down through
  // the flooded ground floor.
  expect(['B/2/R2', 'B/2/U']).toContain(end(snap, 'B/2/R2'));
  expect(end(snap, 'B/1/A')).not.toBe('no_safe_route'); // on the flooded floor: leaves it
});

test('already on a flood-safe floor: stay there instead of walking to the stairs', () => {
  const snap = campus();
  snap.nodes.push(node('H2', 2, 'hallway', ['flood'])); // the second floor is above the flood level
  snap.edges.push(edge('B/2/R2', 'B/2/H2', 4));
  const r = findRoute(snap, 'B/2/R2', 'flood');
  expect(r.ok && r.route.destinationId).toBe('B/2/R2');
  expect(r.ok && r.route.distance_m).toBe(0);
  // ...unless that floor is reported flooded: then it moves on
  expect(end(campus({ floodedFloors: [{ building: 'B', level: 2 }] }), 'B/2/R2')).not.toBe('B/2/R2');
});
