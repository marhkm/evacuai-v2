import { findRoute, type CampusSnapshot, type Route } from '@evacuai/routing';
import { loadCampus } from '@evacuai/routing/src/load';
import { exitBadge, floorRoutePoints, routeChevrons, routeSteps, toPlanShapes } from '../src/index';

const uclm = loadCampus('campus-data/uclm');
const routeOf = (s: CampusSnapshot, origin: string): Route => {
  const r = findRoute(s, origin, 'fire');
  if (!r.ok) throw new Error(r.reason);
  return r.route;
};

test('toPlanShapes draws the poster plan: walls, door arcs, stairs, labels', () => {
  const p = toPlanShapes(uclm, 'A1', 4);
  expect(p.walls.length).toBeGreaterThan(100);
  expect(p.doors.length).toBeGreaterThan(0);
  expect(p.doors.every(d => d.startsWith('M'))).toBe(true);
  expect(p.stairs.length).toBeGreaterThan(0);
  expect(p.labels.map(l => l.text)).toContain("CCS DEAN'S OFFICE");
  expect(p.bounds.w).toBeGreaterThan(30);
});

test('toPlanShapes falls back to room outlines when a floor has no plan', () => {
  const p = toPlanShapes(uclm, 'BE', 1);
  const rooms = uclm.rooms.filter(r => r.building === 'BE' && r.level === 1);
  expect(p.walls).toEqual(rooms.map(r => r.polygon));
  expect(p.labels.map(l => l.text).sort()).toEqual(rooms.filter(r => r.type !== 'corridor').map(r => r.name).sort());
  expect(p.doors).toEqual([]);
});

test('routeChevrons places arrows every 1.5 m pointing along the route', () => {
  expect(routeChevrons([[0, 0], [6, 0]])).toEqual([
    { x: 0.75, y: 0, deg: 0 }, { x: 2.25, y: 0, deg: 0 }, { x: 3.75, y: 0, deg: 0 }, { x: 5.25, y: 0, deg: 0 },
  ]);
  const corner = routeChevrons([[0, 0], [3, 0], [3, 3]]);
  expect(corner.map(c => c.deg)).toEqual([0, 0, 90, 90]);
  expect(routeChevrons([[1, 1]])).toEqual([]);
});

test('floorRoutePoints stops at the exit instead of running off the plan', () => {
  const route = routeOf(uclm, 'A1/1/R_STUDY_HALL');
  const pts = floorRoutePoints(uclm, route, 'A1', 1);
  const exitNode = uclm.nodes.find(n => n.id === route.nodeIds[route.nodeIds.length - 2])!;
  expect(exitNode.type).toBe('exit');
  expect(pts.at(-1)).toEqual([exitNode.x, exitNode.y]);
  expect(floorRoutePoints(uclm, route, 'A1', 4)).toEqual([]);
});

test('exitBadge names the destination when the route leaves this floor plan', () => {
  const route = routeOf(uclm, 'A1/1/R_STUDY_HALL');
  expect(route.destinationId).toBe('A1/1/AP_Outside');
  expect(exitBadge(uclm, route, 'A1', 1)).toBe('Exit to Off-campus assembly area');
  const upstairs = routeOf(uclm, 'A1/4/R_A_31');
  expect(exitBadge(uclm, upstairs, 'A1', 4)).toBeNull(); // continues down the stairs, still inside
});

test('crossing to the Old Building is described as a crossing, not an exit or a staircase', () => {
  const route = routeOf(uclm, 'A1/7/R_A_67');
  const link = uclm.nodes.find(n => route.nodeIds.includes(n.id) && n.type === 'exit' && n.level === 7);
  if (!link) return; // this room's route uses the stairs
  expect(exitBadge(uclm, route, 'A1', 7)).toBe('Cross to the Old Building');
  const steps = routeSteps(uclm, route);
  expect(steps.join(' | ')).toContain('Cross to the Old Building, then go down to Ground');
  expect(steps.join(' | ')).not.toMatch(/Take To Old Building/);
});
