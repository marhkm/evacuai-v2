import { findRoute, type CampusSnapshot } from '@evacuai/routing';
import { readFileSync } from 'node:fs';
import type * as THREE from 'three';

import { applyStatus, buildScene, COLORS, showRoute, triangleCount } from '../src/index';

const load = (name: string): CampusSnapshot => JSON.parse(readFileSync(new URL(`../../../campus-data/${name}.snapshot.json`, import.meta.url), 'utf8'));

describe('buildScene', () => {
  const uclm = load('uclm');
  const c = buildScene(uclm, { building: 'BE' });

  it('makes one group per floor and one mesh per room of the building, mapped by roomId', () => {
    expect(c.floors.size).toBe(uclm.buildings.find(b => b.id === 'BE')!.floors.length);
    expect(c.rooms.size).toBe(uclm.rooms.filter(r => r.building === 'BE').length);
    const [id, mesh] = [...c.rooms][0];
    expect(mesh.userData.roomId).toBe(id);
  });

  it('stacks floors by elevation', () => {
    const y = (key: string) => [...c.floors.get(key)!.children].map(m => m.position.y);
    expect(Math.min(...y('BE/3'))).toBeGreaterThan(Math.max(...y('BE/1')));
  });

  it('stays under the 120K triangle budget', () => {
    expect(triangleCount(c)).toBeLessThan(120_000);
  });
});

describe('live overlays', () => {
  const demo = load('demo');
  const c = buildScene(demo);

  it('draws blocked and congested paths, hazards, crowd heat and pins', () => {
    applyStatus(c, demo, {
      edges: { 'DEMO/1/C1->DEMO/1/C2': 'blocked', 'DEMO/2/C3->DEMO/2/C4': 'congested' },
      hazardRoomIds: ['DEMO/1/R101'],
      roomCounts: { 'DEMO/2/R201': 6 },
      pins: [{ id: 'sos-1', nodeId: 'DEMO/2/S2', kind: 'sos' }, { id: 'ghost', nodeId: 'NOPE', kind: 'sos' }],
    });
    const lines = (name: string) => c.overlay.edges.getObjectByName(name) as THREE.Group | undefined;
    expect(lines('blocked')?.userData.count).toBe(1);
    expect(lines('congested')?.userData.count).toBe(1);
    const color = (id: string) => ((c.rooms.get(id)!.material as THREE.MeshStandardMaterial).color.getHex());
    expect(color('DEMO/1/R101')).toBe(COLORS.hazard);
    expect(color('DEMO/2/R201')).toBe(COLORS.heat[2]);
    expect(c.overlay.pins.children).toHaveLength(1); // unknown node ignored

    applyStatus(c, demo, { edges: {} }); // live map without the edge: it was reopened
    expect(c.overlay.edges.children).toHaveLength(0);

    applyStatus(c, demo, {}); // back to the snapshot: no overlays left behind
    expect(c.overlay.edges.children).toHaveLength(0);
    expect(c.overlay.pins.children).toHaveLength(0);
    expect(color('DEMO/1/R101')).not.toBe(COLORS.hazard);
  });

  it('shows and clears a multi-floor route', () => {
    const r = findRoute(demo, 'DEMO/2/R201', 'earthquake');
    if (!r.ok) throw new Error('expected a route');
    showRoute(c, r.route);
    expect(c.overlay.route.children.some(o => o.name.startsWith('route-DEMO/'))).toBe(true);
    showRoute(c, null);
    expect(c.overlay.route.children).toHaveLength(0);
  });
});

// ── Phase 2: real walls from the evacuation posters ──
import { routeChevrons } from '@evacuai/campus-view';
import { explode, floorStyles } from '../src/index';

describe('poster walls and route arrows', () => {
  const uclm = load('uclm');
  const c = buildScene(uclm, { building: 'A1' });

  it('draws the route as red arrows on the floor, one per chevron', () => {
    const r = findRoute(uclm, 'A1/4/R_A_31', 'fire');
    if (!r.ok) throw new Error('expected a route');
    showRoute(c, r.route);
    const all = r.route.nodeIds.map(id => uclm.nodes.find(n => n.id === id)!);
    const nodes = all.slice(0, all.findIndex(n => n.type === 'exit') + 1); // drawn up to the building exit
    let expected = 0;
    let run: [number, number][] = [];
    nodes.forEach((n, i) => {
      run.push([n.x, n.y]);
      const next = nodes[i + 1];
      if (!next || next.building !== n.building || next.level !== n.level) {
        expected += routeChevrons(run).length;
        run = [];
      }
    });
    const arrows: THREE.Mesh[] = [];
    c.overlay.route.traverse(o => { if (o.name === 'arrow') arrows.push(o as THREE.Mesh); });
    expect(arrows.length).toBe(expected);
    expect((arrows[0].material as THREE.MeshBasicMaterial).color.getHex()).toBe(COLORS.route);
    showRoute(c, null);
    expect(c.overlay.route.children).toHaveLength(0);
  });

  it('explodes floors apart and back', () => {
    const top = c.floors.get('A1/7')!;
    explode(c, 2);
    expect(top.position.y).toBeGreaterThan(0);
    expect(c.nodePos.get('A1/7/S1')!.y).toBeGreaterThan(17.5 + top.position.y - 0.01);
    explode(c, 0);
    expect(top.position.y).toBe(0);
  });
});

describe('route end and shared shapes', () => {
  const uclm = load('uclm');
  const c = buildScene(uclm, { building: 'A1' });
  const r = findRoute(uclm, 'A1/7/R_A_67', 'fire');
  if (!r.ok) throw new Error('expected a route');

  it('stops the route at the building exit instead of running to the off-campus assembly area', () => {
    showRoute(c, r.route);
    const exit = r.route.nodeIds.find(id => uclm.nodes.find(n => n.id === id)!.type === 'exit')!;
    const floors = c.overlay.route.children.filter(o => o.name.startsWith('route-A1/'));
    const end = floors.at(-1)!.getObjectByName('ribbon')!.userData.end as THREE.Vector3;
    const at = c.nodePos.get(exit)!;
    expect(Math.hypot(end.x - at.x, end.z - at.z)).toBeLessThan(0.01);
  });

  it('keeps the shared arrow shape when the route is cleared', () => {
    showRoute(c, r.route);
    const geo = (c.overlay.route.getObjectByName('arrow') as THREE.Mesh).geometry;
    let disposed = false;
    geo.addEventListener('dispose', () => { disposed = true; });
    showRoute(c, null);
    expect(disposed).toBe(false);
  });
});

describe('route ribbon', () => {
  const uclm = load('uclm');
  const c = buildScene(uclm, { building: 'A1' });
  const r = findRoute(uclm, 'A1/7/R_A_67', 'fire');
  if (!r.ok) throw new Error('expected a route');

  it('draws one red ribbon per floor the route crosses, as long as the route on that floor', () => {
    showRoute(c, r.route);
    const groups = c.overlay.route.children.filter(o => o.name.startsWith('route-A1/'));
    expect(groups[0].name).toBe('route-A1/7');
    const ids = r.route.nodeIds.filter(id => id.startsWith('A1/7/'));
    const pts = ids.map(id => c.nodePos.get(id)!);
    const length = pts.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - pts[i].x, p.z - pts[i].z), 0);
    expect(groups[0].getObjectByName('ribbon')!.userData.length).toBeCloseTo(length, 0);
  });

  it('hides the route on floors that are hidden', () => {
    showRoute(c, r.route);
    const floors = [...c.floors.values()].map(g => ({ key: g.name, building: 'A1', level: g.userData.level as number }));
    c.setFloorStyles(floorStyles(floors, { building: 'A1', level: 4 }));
    expect(c.overlay.route.getObjectByName('route-A1/7')!.visible).toBe(false);
    const third = c.overlay.route.getObjectByName('route-A1/4');
    if (third) expect(third.visible).toBe(true);
  });
});
