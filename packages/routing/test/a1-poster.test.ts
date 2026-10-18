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

