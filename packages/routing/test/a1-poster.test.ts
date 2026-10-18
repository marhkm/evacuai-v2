import { findRoute } from '../src/route';
import { loadCampus } from '../src/load';

// Annex 1 was imported from UCLM's evacuation posters. Its computed fire routes must lead off campus and, at every
// corridor point that carries a poster arrow, leave in the direction that arrow points (within 90°).
const snap = loadCampus('campus-data/uclm');
const a1 = snap.buildings.find(b => b.id === 'A1')!;

describe.each(a1.floors.map(f => [f.name, f.level] as const))('Annex 1 %s', (_name, level) => {
  const floor = a1.floors.find(f => f.level === level)!;
  const rooms = snap.nodes.filter(n => n.building === 'A1' && n.level === level && n.type === 'room');

  test('every room evacuates to the off-campus assembly area for fire', () => {
    for (const room of rooms) {
      const r = findRoute(snap, room.id, 'fire');
      expect(r.ok, room.id).toBe(true);
      if (r.ok) expect(r.route.destinationId).toBe('A1/1/AP_Outside');
    }
  });

  test('the fire route follows the poster arrows', () => {
    const arrows = floor.plan!.arrows;
    const farthest = rooms
      .map(room => ({ room, r: findRoute(snap, room.id, 'fire') }))
      .filter(x => x.r.ok)
      .sort((a, b) => (b.r.ok && a.r.ok ? b.r.route.distance_m - a.r.route.distance_m : 0))[0];
    expect(farthest).toBeDefined();
    if (!farthest?.r.ok) return;
    const path = farthest.r.route.nodeIds.map(id => snap.nodes.find(n => n.id === id)!);
    let checked = 0;
    path.forEach((n, i) => {
      const next = path[i + 1];
      const arrow = arrows.find(a => Math.hypot(a.x - n.x, a.y - n.y) < 0.05);
      // Corridor-to-corridor moves only: an arrow drawn on a stair means "down these stairs", not a map heading.
      if (!arrow || !next || next.level !== level || next.building !== 'A1' || next.type !== 'hallway') return;
      const heading = (Math.atan2(next.y - n.y, next.x - n.x) * 180) / Math.PI;
      const off = Math.abs(((heading - arrow.deg + 540) % 360) - 180);
      expect(off, `${n.id} → ${next.id}: route heads ${heading.toFixed(0)}°, poster arrow ${arrow.deg}°`).toBeLessThanOrEqual(90);
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });
});


test('Annex 1: the assembly area is only ever an end point, never a shortcut between floors', () => {
  // With the only stair chain blocked at the bottom, a flood route must not go outside and back in.
  const blocked = { ...snap, edges: snap.edges.map(e => (e.id === 'A1/2/S1->A1/1/S1' ? { ...e, status: 'blocked' as const } : e)) };
  for (const s of [snap, blocked]) {
    for (const n of s.nodes.filter(x => x.building === 'A1' && x.type === 'room')) {
      for (const hazard of ['earthquake', 'fire', 'flood'] as const) {
        const r = findRoute(s, n.id, hazard);
        if (!r.ok) continue;
        const middle = r.route.nodeIds.slice(0, -1).map(id => s.nodes.find(x => x.id === id)!);
        expect(middle.some(x => x.type === 'assembly_point'), `${n.id} ${hazard}`).toBe(false);
      }
    }
  }
});

test('Annex 1: corridor hops never pass through a wall', () => {
  const crosses = (p1: number[], p2: number[], q1: number[], q2: number[]) => {
    const o = (a: number[], b: number[], c: number[]) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    return o(p1, p2, q1) * o(p1, p2, q2) < 0 && o(q1, q2, p1) * o(q1, q2, p2) < 0;
  };
  for (const f of a1.floors) {
    const walls = f.plan!.walls.filter(w => Math.hypot(w[1][0] - w[0][0], w[1][1] - w[0][1]) >= 1);
    for (const e of snap.edges) {
      const a = snap.nodes.find(n => n.id === e.from)!;
      const b = snap.nodes.find(n => n.id === e.to)!;
      if (e.type !== 'corridor' || a.building !== 'A1' || a.level !== f.level || b.level !== f.level) continue;
      const hit = walls.find(w => crosses([a.x, a.y], [b.x, b.y], w[0], w[1]));
      expect(hit, `${e.id} crosses a wall`).toBeUndefined();
    }
  }
});
