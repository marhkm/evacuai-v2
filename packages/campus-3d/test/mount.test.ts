// @vitest-environment jsdom
import type { CampusSnapshot } from '@evacuai/routing';
import * as THREE from 'three';
import { vi } from 'vitest';

import snapshot from '../../../campus-data/uclm.snapshot.json';
import { mount, type RendererLike } from '../src/mount';

const uclm = snapshot as unknown as CampusSnapshot;

// No WebGL in jsdom: a renderer that only owns a canvas.
const fakeRenderer = (): RendererLike => ({
  domElement: document.createElement('canvas'),
  shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap, autoUpdate: true, needsUpdate: false },
  setPixelRatio: () => {},
  setSize: () => {},
  render: () => {},
  dispose: () => {},
});
const open = (el = document.createElement('div')) => mount(el, uclm, { createRenderer: fakeRenderer, controls: false, initial: { building: 'A1' } });
const labels = (scene: THREE.Scene) => {
  const shown: string[] = [];
  scene.traverse(o => { if ((o as { isCSS2DObject?: boolean }).isCSS2DObject && o.visible && o.userData.floor) shown.push(o.userData.floor); });
  return shown;
};

describe('viewer', () => {
  it('opens on the chosen building only', () => {
    const v = open();
    expect(v.state()).toMatchObject({ building: 'A1', level: null, view: '3d' });
    expect([...v.campus.floors.keys()].every(k => k.startsWith('A1/'))).toBe(true);
    v.dispose();
  });

  it('focuses one floor: floors above hidden, room labels only on that floor', () => {
    const v = open();
    v.setFloor(4);
    expect(v.state().level).toBe(4);
    expect(v.campus.floors.get('A1/7')!.visible).toBe(false);
    const shown = labels(v.campus.scene);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every(f => f === 'A1/4')).toBe(true);
    v.setFloor(null);
    expect(labels(v.campus.scene)).toHaveLength(0); // All floors: building label only
    v.dispose();
  });

  it('Top view locks rotation; 3D unlocks it', () => {
    const v = open();
    v.setView('top');
    expect(v.state()).toMatchObject({ view: 'top', rotate: false });
    v.setView('3d');
    expect(v.state().rotate).toBe(true);
    v.dispose();
  });

  it('switches building by rebuilding the scene, disposing the old one and keeping live status', () => {
    const v = open();
    v.update({ pins: [{ id: 'sos-1', nodeId: 'BE/1/C1_01', kind: 'sos' }] });
    const oldWalls = v.campus.floors.get('A1/1')!.getObjectByName('walls') as THREE.Mesh;
    const disposed = vi.fn();
    oldWalls.geometry.addEventListener('dispose', disposed);
    const changes = vi.fn();
    v.onChange(changes);
    v.setBuilding('BE');
    expect(v.campus.building).toBe('BE');
    expect([...v.campus.floors.keys()].some(k => k.startsWith('A1/'))).toBe(false);
    expect(disposed).toHaveBeenCalled();
    expect(v.campus.overlay.pins.children).toHaveLength(1); // the live SOS pin, now in this building
    expect(changes).toHaveBeenCalledWith(expect.objectContaining({ building: 'BE', level: null }));
    v.dispose();
  });

  it('leaves nothing behind when closed, however often it is opened', () => {
    const el = document.createElement('div');
    for (let i = 0; i < 3; i++) open(el).dispose();
    expect(el.children).toHaveLength(0);
  });

  it('reports whether there is a route, for the Follow route button', () => {
    const v = open();
    expect(v.state().hasRoute).toBe(false);
    v.route({ nodeIds: ['A1/4/C1', 'A1/4/C2'], destinationId: 'A1/4/C2', distance_m: 5, cost: 5 });
    expect(v.state().hasRoute).toBe(true);
    v.dispose();
  });
});

describe('viewer fixes', () => {
  it('shows the room card from the control bar even when the page passes no onPick', () => {
    const el = document.createElement('div');
    const v = mount(el, uclm, { createRenderer: fakeRenderer, initial: { building: 'A1' } }); // controls on, no onPick
    const room = [...v.campus.rooms.keys()].find(k => k.startsWith('A1/4/'))!;
    v.focusRoom(room);
    const card = el.querySelector('[role="dialog"][aria-label="Room details"]') as HTMLElement;
    expect(card.hidden).toBe(false);
    v.dispose();
  });

  it('frees the old building\'s light shadow and every floor material on a building switch', () => {
    const v = open();
    const sun = v.campus.scene.getObjectByName('sun') as THREE.DirectionalLight;
    const sunDispose = vi.spyOn(sun, 'dispose');
    const mat = v.campus.floors.get('A1/1')!.userData.materials[0] as THREE.Material;
    const matDispose = vi.spyOn(mat, 'dispose');
    v.setBuilding('BE');
    expect(sunDispose).toHaveBeenCalled();
    expect(matDispose).toHaveBeenCalled();
    v.dispose();
  });

  it('treats a floor the building does not have as the whole building', () => {
    const v = open();
    v.setFloor(99);
    expect(v.state().level).toBeNull();
    expect([...v.campus.floors.values()].every(g => g.visible)).toBe(true);
    v.dispose();
  });
});

describe('viewer polish', () => {
  // Reduced motion: camera moves are instant, so the tests can read the camera straight away.
  beforeEach(() => { vi.stubGlobal('matchMedia', () => ({ matches: true })); vi.useFakeTimers(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('Reset recentres the camera even when floor, view and explode are already the defaults', () => {
    const v = open();
    const home = v.camera.position.clone();
    v.camera.position.set(200, 5, -200); // the user orbited away
    v.reset();
    expect(v.camera.position.distanceTo(home)).toBeLessThan(0.01);
    v.dispose();
  });

  it("refits after explode without undoing the user's own rotation", () => {
    const v = open();
    const target = v.campus.bounds.getCenter(new THREE.Vector3());
    v.camera.position.copy(target).add(new THREE.Vector3(-80, 30, 0)); // looking from the west
    v.explode(2);
    vi.advanceTimersByTime(250);
    const dir = v.camera.position.clone().sub(target).normalize();
    expect(dir.x).toBeLessThan(-0.5); // still from the west
    expect(Math.abs(dir.z)).toBeLessThan(0.3);
    v.dispose();
  });

  it('draws shadows only when the scene changes, not on every frame', () => {
    let shadow!: RendererLike['shadowMap'];
    const v = mount(document.createElement('div'), uclm, { controls: false, initial: { building: 'A1' }, createRenderer: () => { const r = fakeRenderer(); shadow = r.shadowMap; return r; } });
    expect(shadow.autoUpdate).toBe(false);
    shadow.needsUpdate = false;
    v.explode(1);
    expect(shadow.needsUpdate).toBe(true);
    shadow.needsUpdate = false;
    v.route({ nodeIds: ['A1/4/C1', 'A1/4/C2'], destinationId: 'A1/4/C2', distance_m: 5, cost: 5 });
    expect(shadow.needsUpdate).toBe(true);
    v.dispose();
  });

  it('lifts the building name above the exploded floors', () => {
    const v = open();
    const name = () => { let y = 0; v.campus.scene.traverse(o => { if ((o as { isCSS2DObject?: boolean }).isCSS2DObject && !o.userData.floor) y = o.position.y; }); return y; };
    const before = name();
    v.explode(3);
    expect(name()).toBeGreaterThan(before + 5);
    v.dispose();
  });

  it('backs the camera off on a tall, narrow (phone) view so the whole floor fits across', () => {
    const v = open();
    v.setView('top');
    const wide = v.camera.position.distanceTo(new THREE.Vector3(...v.campus.bounds.getCenter(new THREE.Vector3()).toArray()));
    v.camera.aspect = 0.5;
    v.setView('front');
    v.setView('top');
    const tall = v.camera.position.distanceTo(new THREE.Vector3(...v.campus.bounds.getCenter(new THREE.Vector3()).toArray()));
    expect(tall / wide).toBeGreaterThan(1.8);
    v.dispose();
  });

  it('goes back to the 3D view when the next building has no part of the route', () => {
    const v = open();
    v.route({ nodeIds: ['A1/4/C1', 'A1/4/C2'], destinationId: 'A1/4/C2', distance_m: 5, cost: 5 });
    v.setView('route');
    v.setBuilding('BE');
    expect(v.state()).toMatchObject({ hasRoute: false, view: '3d' });
    v.dispose();
  });
});
