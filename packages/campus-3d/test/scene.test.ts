import type { CampusSnapshot } from '@evacuai/routing';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import { applyStatus, buildScene, triangleCount } from '../src/index';
import { stairSteps } from '../src/scene/stairs';
import { thickWalls } from '../src/scene/walls';
import { floorStyles } from '../src/views';

const load = (name: string): CampusSnapshot => JSON.parse(readFileSync(new URL(`../../../campus-data/${name}.snapshot.json`, import.meta.url), 'utf8'));
const uclm = load('uclm');

describe('architectural-model geometry', () => {
  it('raises walls 0.15 m thick to the given height', () => {
    const geo = thickWalls([[[0, 0], [10, 0]]], { dx: 0, dz: 0, height: 3.35 });
    geo.computeBoundingBox();
    const b = geo.boundingBox!;
    expect(b.max.y - b.min.y).toBeCloseTo(3.35, 2);
    expect(b.max.z - b.min.z).toBeCloseTo(0.15, 2);
    expect(b.max.x - b.min.x).toBeGreaterThanOrEqual(10); // ends overlap a little so corners close
  });

  it('builds stairs as 12 steps', () => {
    const geo = stairSteps([[0, 0], [2, 0], [2, 4], [0, 4]], { dx: 0, dz: 0, height: 3.35 });
    const tops = new Set<number>();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) tops.add(Math.round(pos.getY(i) * 1000));
    expect(tops.size).toBeGreaterThanOrEqual(12);
  });
});

describe('one building per scene', () => {
  const a1 = buildScene(uclm, { building: 'A1' });

  it('draws only the chosen building', () => {
    expect(a1.building).toBe('A1');
    expect([...a1.floors.keys()].every(k => k.startsWith('A1/'))).toBe(true);
    expect([...a1.rooms.keys()].every(k => k.startsWith('A1/'))).toBe(true);
  });

  it('merges each floor\'s walls into one mesh', () => {
    for (const g of a1.floors.values()) expect(g.children.filter(o => o.name === 'walls')).toHaveLength(1);
  });

  it('keeps Annex 1 under the 120K triangle budget', () => {
    expect(triangleCount(a1)).toBeLessThan(120_000);
  });

  it('still works for Basic Ed, which has room outlines but no traced plan', () => {
    const be = buildScene(uclm, { building: 'BE' });
    expect([...be.floors.values()].every(g => g.getObjectByName('walls'))).toBe(true);
    expect(be.labels.rooms.size).toBeGreaterThan(0);
    expect(be.labels.building.has('BE')).toBe(true);
  });

  it('keeps floor styles when live status changes', () => {
    const c = buildScene(uclm, { building: 'A1' });
    const floors = [...c.floors.values()].map(g => ({ key: g.name, building: 'A1', level: g.userData.level as number }));
    c.setFloorStyles(floorStyles(floors, { building: 'A1', level: 4 }));
    const hazardRoom = [...c.rooms.keys()].find(k => k.startsWith('A1/3/'))!;
    applyStatus(c, uclm, { hazardRoomIds: [hazardRoom] });
    expect(c.floors.get('A1/7')!.visible).toBe(false);
    const mat = c.rooms.get(hazardRoom)!.material as THREE.MeshStandardMaterial;
    expect(mat.opacity).toBeLessThanOrEqual(0.15 + 1e-6); // the ghosted floor stays ghosted
    expect(c.rooms.get([...c.rooms.keys()].find(k => k.startsWith('A1/4/'))!)!.material).toMatchObject({ opacity: expect.any(Number) });
  });
});

it('keeps depth writing on nearly solid (exploded) floors, so back walls do not show through', () => {
  const c = buildScene(uclm, { building: 'A1' });
  const floors = [...c.floors.values()].map(g => ({ key: g.name, building: 'A1', level: g.userData.level as number }));
  c.setFloorStyles(floorStyles(floors, { building: 'A1', level: null }, { exploded: true }));
  const walls = c.floors.get('A1/1')!.getObjectByName('walls') as THREE.Mesh;
  expect((walls.material as THREE.Material).depthWrite).toBe(true);
  c.setFloorStyles(floorStyles(floors, { building: 'A1', level: null }));
  expect((walls.material as THREE.Material).depthWrite).toBe(false); // 0.25: see-through
});
