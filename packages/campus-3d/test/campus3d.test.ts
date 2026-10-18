import { findRoute, type CampusSnapshot } from '@evacuai/routing';
import { readFileSync } from 'node:fs';
import type * as THREE from 'three';

import { applyStatus, buildScene, COLORS, showRoute, triangleCount } from '../src/index';

const load = (name: string): CampusSnapshot => JSON.parse(readFileSync(new URL(`../../../campus-data/${name}.snapshot.json`, import.meta.url), 'utf8'));

describe('buildScene', () => {
  const uclm = load('uclm');
  const c = buildScene(uclm);

  it('makes one group per floor and one mesh per room, mapped by roomId', () => {
    const floorCount = uclm.buildings.reduce((n, b) => n + b.floors.length, 0);
    expect(c.floors.size).toBe(floorCount);
    expect(c.rooms.size).toBe(uclm.rooms.length);
    const [id, mesh] = [...c.rooms][0];
    expect(mesh.userData.roomId).toBe(id);
  });

  it('stacks floors by elevation', () => {
    const y = (key: string) => [...c.floors.get(key)!.children].map(m => m.position.y);
    expect(Math.min(...y('BE/3'))).toBeGreaterThan(Math.max(...y('BE/1')));
  });

  it('stays under the 50K triangle budget', () => {
    expect(triangleCount(c)).toBeLessThan(50_000);
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
    const color = (id: string) => ((c.rooms.get(id)!.material as THREE.MeshLambertMaterial).color.getHex());
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
    expect(c.overlay.route.getObjectByName('route')).toBeTruthy();
    showRoute(c, null);
    expect(c.overlay.route.children).toHaveLength(0);
  });
});

// ── Phase 2: real walls from the evacuation posters ──
import { routeChevrons } from '@evacuai/campus-view';
import { explode } from '../src/index';

describe('poster walls and route arrows', () => {
  const uclm = load('uclm');
  const c = buildScene(uclm);
  const walls = (key: string) => c.floors.get(key)!.getObjectByName('walls') as THREE.Mesh | undefined;

  it('raises the traced walls for Annex 1 and room outlines for floors without a plan', () => {
    const a1 = walls('A1/4')!;
    const plan = uclm.buildings.find(b => b.id === 'A1')!.floors.find(f => f.level === 4)!.plan!;
    expect(a1.geometry.attributes.position.count).toBe(plan.walls.reduce((n, w) => n + (w.length - 1) * 6, 0)); // 2 triangles per wall piece
    expect(walls('BE/1')).toBeTruthy();
  });

  it('keeps the whole campus under the triangle budget', () => {
    expect(triangleCount(c)).toBeLessThan(50_000);
  });

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
    const arrows = c.overlay.route.getObjectByName('arrows')!;
    expect(arrows.children.length).toBe(expected);
    expect(((arrows.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex()).toBe(COLORS.route);
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
  const c = buildScene(uclm);
  const r = findRoute(uclm, 'A1/7/R_A_67', 'fire');
  if (!r.ok) throw new Error('expected a route');

  it('stops the route at the building exit instead of running to the off-campus assembly area', () => {
    showRoute(c, r.route);
    const exit = r.route.nodeIds.find(id => uclm.nodes.find(n => n.id === id)!.type === 'exit')!;
    const pos = (c.overlay.route.getObjectByName('route') as THREE.Mesh<THREE.TubeGeometry>).geometry.parameters.path.getPoint(1);
    expect(pos.distanceTo(c.nodePos.get(exit)!)).toBeLessThan(0.01);
  });

  it('keeps the shared arrow shape when the route is cleared', () => {
    showRoute(c, r.route);
    const geo = ((c.overlay.route.getObjectByName('arrows')!.children[0]) as THREE.Mesh).geometry;
    let disposed = false;
    geo.addEventListener('dispose', () => { disposed = true; });
    showRoute(c, null);
    expect(disposed).toBe(false);
  });
});
