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
