import { findRoute, type CampusSnapshot, type Route } from '@evacuai/routing';
import { loadCampus } from '@evacuai/routing/src/load';
import { displayName, routeOverlay, routeSteps, toFloorShapes } from '../src/index';

const demo = () => loadCampus('campus-data/demo');
const routeOf = (s: CampusSnapshot, origin: string, hazard: 'earthquake' | 'fire' | 'flood'): Route => {
  const r = findRoute(s, origin, hazard);
  if (!r.ok) throw new Error(r.reason);
  return r.route;
};

test('toFloorShapes keeps same-floor edges only, with status', () => {
  const s = demo();
  const shapes = toFloorShapes(s, 'DEMO', 2);
  expect(shapes.edges).toHaveLength(4);
  expect(shapes.edges.every(e => e.status === 'open')).toBe(true);
  s.edges.find(e => e.id === 'DEMO/2/C3->DEMO/2/C4')!.status = 'blocked';
  expect(toFloorShapes(s, 'DEMO', 2).edges.find(e => e.id === 'DEMO/2/C3->DEMO/2/C4')!.status).toBe('blocked');
});

test('hazard room status', () => {
  const s = demo();
  s.hazardRoomIds = ['DEMO/2/R201'];
  expect(toFloorShapes(s, 'DEMO', 2).rooms.find(r => r.id === 'DEMO/2/R201')!.status).toBe('hazard');
});

test('routeOverlay splits per floor with a stair transition', () => {
  const s = demo();
  const o = routeOverlay(s, routeOf(s, 'DEMO/2/R201', 'earthquake'));
  expect(o.segments.map(x => x.level)).toEqual([2, 1]);
  expect(o.transitions).toEqual([{ atNodeId: 'DEMO/2/S2', fromLevel: 2, toLevel: 1, direction: 'down', label: 'S2 ↓ Ground' }]);
});

test('routeSteps text', () => {
  const s = demo();
  expect(routeSteps(s, routeOf(s, 'DEMO/2/R201', 'earthquake'))).toEqual(['Exit R201', 'Take S2 down to Ground', 'Go to X1']);
});

test('origin is destination', () => {
  const s = demo();
  expect(routeSteps(s, routeOf(s, 'DEMO/1/X1', 'fire'))).toEqual(['You are at X1. Stay here.']);
});

test('displayName strips floor suffix and underscores', () => {
  const s: CampusSnapshot = { ...demo(), rooms: [], nodes: [
    { id: 'BE/1/Stairs_Left_G', building: 'BE', level: 1, type: 'stairwell', x: 0, y: 0, safe_for: [] },
  ] };
  expect(displayName(s, 'BE/1/Stairs_Left_G')).toBe('Stairs Left');
});

test('step floor name comes from the building being entered', () => {
  const s = demo();
  s.buildings.push({ ...s.buildings[0], id: 'B2', floors: [{ level: 1, name: 'Lobby', elevation_m: 0, height_m: 3.5 }] });
  s.nodes.push({ id: 'B2/1/L', building: 'B2', level: 1, type: 'exit', x: 0, y: 0, safe_for: ['fire'] });
  const route: Route = { nodeIds: ['DEMO/2/C3', 'B2/1/L'], distance_m: 1, cost: 1, destinationId: 'B2/1/L' };
  expect(routeSteps(s, route)[1]).toBe('Take C3 down to Lobby');
});
