import type { CampusSnapshot, Route } from '@evacuai/routing';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { attachControls, type Controls } from './controls';
import { applyStatus, buildScene, explode, routeTick, showRoute, type Campus3D, type LiveState } from './index';
import { cameraFor, floorStyles, type Focus, type Preset } from './views';

/** The parts of THREE.WebGLRenderer the viewer uses (tests pass a stand-in; there is no WebGL in jsdom). */
export interface RendererLike {
  domElement: HTMLCanvasElement;
  shadowMap: { enabled: boolean; type: THREE.ShadowMapType; autoUpdate: boolean; needsUpdate: boolean };
  setPixelRatio(r: number): void;
  setSize(w: number, h: number, updateStyle?: boolean): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

export type ViewerState = { building: string; level: number | null; view: Preset; explode: number; hasRoute: boolean; rotate: boolean };
export type PickInfo = Record<string, unknown> & { roomId?: string; name?: string; floorName?: string; count?: number; hazard?: boolean; sos?: boolean };

export interface Viewer {
  /** The scene of the building in view (replaced by setBuilding). */
  readonly campus: Campus3D;
  readonly camera: THREE.PerspectiveCamera;
  update(live: LiveState): void;
  route(route: Route | null): void;
  /** Spread the floors apart (0 = real heights); the route and pins follow. */
  explode(factor: number): void;
  setBuilding(id: string): void;
  /** One floor (others above hidden, below ghosted), or null for All floors. */
  setFloor(level: number | null): void;
  setView(view: Preset): void;
  /** Fly to a room and report it through onPick. */
  focusRoom(id: string): void;
  reset(): void;
  state(): ViewerState;
  onChange(cb: (s: ViewerState) => void): () => void;
  dispose(): void;
}

export const webglAvailable = (): boolean => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
};

const FLY_MS = 600;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2); // ease-in-out
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const raf = (cb: FrameRequestCallback) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : (setTimeout(() => cb(Date.now()), 16) as unknown as number));
const caf = (id: number) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));

const LABEL_CSS = `
.evac3d-label{font:600 12px Inter,system-ui,sans-serif;color:#0B1220;background:rgba(255,255,255,.88);padding:2px 6px;border-radius:6px;
  white-space:nowrap;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.evac3d-label.building{font:700 16px 'Barlow Condensed','Arial Narrow',sans-serif;letter-spacing:.04em;text-transform:uppercase;background:#0B1220;color:#fff}`;

/**
 * Renders one building into `el` with orbit/pinch controls, room labels, camera presets and (unless `controls: false`)
 * the built-in control bar. Renders on demand: frames run only while the camera flies or a route is shown.
 */
export function mount(
  el: HTMLElement,
  snap: CampusSnapshot,
  opts: { onPick?: (info: PickInfo) => void; quality?: 'high' | 'low'; controls?: boolean; initial?: Partial<Focus>; createRenderer?: () => RendererLike } = {},
): Viewer {
  const quality = opts.quality ?? 'high';
  const renderer: RendererLike = opts.createRenderer?.() ?? new THREE.WebGLRenderer({ antialias: quality === 'high' });
  renderer.setPixelRatio(Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, quality === 'high' ? 2 : 1.5));
  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the sun never moves: redraw shadows only when the building changes
  const reshadow = () => { renderer.shadowMap.needsUpdate = true; };
  el.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.display = 'block';

  const labels = new CSS2DRenderer();
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  el.appendChild(labels.domElement);
  const style = document.createElement('style');
  style.textContent = LABEL_CSS;
  el.appendChild(style);
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI / 2.05; // never under the ground

  const s: ViewerState = { building: opts.initial?.building ?? snap.buildings[0].id, level: opts.initial?.level ?? null, view: '3d', explode: 0, hasRoute: false, rotate: true };
  const listeners = new Set<(st: ViewerState) => void>();
  let bar: Controls | null = null;
  const changed = () => listeners.forEach(cb => cb({ ...s }));
  let campus!: Campus3D;
  let lastLive: LiveState = {};
  let lastRoute: Route | null = null;
  let refitTimer: ReturnType<typeof setTimeout> | undefined;

  const render = () => {
    renderer.render(campus.scene, camera);
    labels.render(campus.scene, camera);
  };
  controls.addEventListener('change', render);

  // Frames: a camera flight (eased), and the moving route chevrons while a route is shown.
  let flight: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; start: number } | null = null;
  let frame = 0;
  let lastTime = 0;
  const loop = (now: number) => {
    frame = 0;
    if (flight) {
      const t = Math.min(1, (now - flight.start) / FLY_MS);
      camera.position.lerpVectors(flight.from[0], flight.to[0], ease(t));
      controls.target.lerpVectors(flight.from[1], flight.to[1], ease(t));
      controls.update();
      if (t >= 1) flight = null;
    }
    if (s.hasRoute && !reducedMotion()) routeTick(lastTime ? (now - lastTime) / 1000 : 0);
    lastTime = now;
    render();
    if (flight || (s.hasRoute && !reducedMotion())) frame = raf(loop);
  };
  const kick = () => { if (!frame) { lastTime = 0; frame = raf(loop); } };

  const fly = (position: THREE.Vector3, target: THREE.Vector3) => {
    if (reducedMotion()) {
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
      render();
      return;
    }
    flight = { from: [camera.position.clone(), controls.target.clone()], to: [position, target], start: typeof performance === 'object' ? performance.now() : Date.now() };
    kick();
  };

  const focusBox = (): THREE.Box3 => {
    const g = s.level === null ? null : campus.floors.get(`${s.building}/${s.level}`);
    const box = new THREE.Box3();
    if (g) box.setFromObject(g);
    else for (const f of campus.floors.values()) box.expandByObject(f);
    return box.isEmpty() ? campus.bounds.clone() : box;
  };
  // Presets frame for a square view; a tall phone view needs the camera further back to fit the width.
  const fitScale = () => Math.max(1, 1 / camera.aspect);
  const frameView = () => {
    const box = focusBox();
    const start = lastRoute?.nodeIds.map(id => campus.nodePos.get(id)).find(Boolean);
    const { position, target } = cameraFor(s.view, { min: box.min.toArray(), max: box.max.toArray() }, { routeStart: start?.toArray() as [number, number, number] | undefined });
    s.rotate = s.view !== 'top';
    controls.enableRotate = s.rotate;
    const to = new THREE.Vector3(...target);
    fly(new THREE.Vector3(...position).sub(to).multiplyScalar(fitScale()).add(to), to);
  };
  // Same framing distance, but from wherever the user has turned the camera.
  const refit = () => {
    const box = focusBox();
    const { position, target } = cameraFor(s.view, { min: box.min.toArray(), max: box.max.toArray() });
    const to = new THREE.Vector3(...target);
    const dir = camera.position.clone().sub(controls.target).normalize();
    fly(to.clone().addScaledVector(dir, to.distanceTo(new THREE.Vector3(...position)) * fitScale()), to);
  };

  const applyStyles = () => {
    const floors = [...campus.floors.values()].map(g => ({ key: g.name, building: s.building, level: g.userData.level as number }));
    const styles = floorStyles(floors, { building: s.building, level: s.level }, { exploded: s.explode > 0.3 });
    campus.setFloorStyles(styles);
    reshadow();
    campus.scene.traverse(o => {
      if (!(o instanceof CSS2DObject)) return;
      o.visible = o.userData.floor ? styles.get(o.userData.floor)?.labels === true : s.level === null;
    });
  };

  let nameLabels: CSS2DObject[] = [];
  // The building name sits just above the top floor, wherever explode has moved it.
  const placeName = () => {
    const box = new THREE.Box3();
    for (const f of campus.floors.values()) box.expandByObject(f);
    if (!box.isEmpty()) for (const o of nameLabels) o.position.y = box.max.y + 2;
  };
  const addLabels = () => {
    nameLabels = [];
    for (const [id, l] of campus.labels.rooms) {
      const div = document.createElement('div');
      div.className = 'evac3d-label';
      div.textContent = l.name;
      const obj = new CSS2DObject(div);
      obj.position.copy(l.pos);
      obj.userData = { floor: l.floor, roomId: id };
      campus.floors.get(l.floor)?.add(obj); // moves with the floor when exploded
    }
    for (const [id, pos] of campus.labels.building) {
      const div = document.createElement('div');
      div.className = 'evac3d-label building';
      div.textContent = snap.buildings.find(b => b.id === id)?.name ?? id;
      const obj = new CSS2DObject(div);
      obj.position.copy(pos);
      campus.scene.add(obj);
      nameLabels.push(obj);
    }
  };

  const disposeScene = () => {
    if (!campus) return;
    campus.scene.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) if (!m.userData.shared) m.dispose();
      if ((o as THREE.Light).isLight) (o as THREE.Light).dispose(); // frees the sun's shadow map
      if (o instanceof CSS2DObject) o.element.remove();
    });
    campus.disposeMaterials();
  };

  const build = (id: string) => {
    disposeScene();
    campus = buildScene(snap, { building: id });
    campus.scene.background = new THREE.Color(0xf4f6f2);
    const sun = campus.scene.getObjectByName('sun') as THREE.DirectionalLight | undefined;
    if (sun) sun.castShadow = quality === 'high';
    s.building = campus.building;
    addLabels();
    applyStatus(campus, snap, lastLive);
    showRoute(campus, lastRoute);
    s.hasRoute = campus.overlay.route.children.length > 0;
    if (!s.hasRoute && s.view === 'route') s.view = '3d';
    explode(campus, s.explode);
    placeName();
    applyStyles();
  };
  build(s.building);

  const resize = () => {
    const w = el.clientWidth || 300;
    const h = el.clientHeight || 300;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(el);
  resize();
  // First frame without a flight.
  {
    const box = focusBox();
    const { position, target } = cameraFor('3d', { min: box.min.toArray(), max: box.max.toArray() });
    controls.target.set(...target);
    camera.position.set(...position).sub(controls.target).multiplyScalar(fitScale()).add(controls.target);
    controls.update();
    render();
  }

  // Tap (not drag) picks a room, pin or blocked path on a visible floor.
  const ray = new THREE.Raycaster();
  let down: [number, number] | null = null;
  const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; // a drag, not a tap
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const visible = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const targets = [...campus.overlay.pins.children, ...campus.overlay.edges.children.flatMap(g => g.children), ...campus.rooms.values()].filter(visible);
    const hit = ray.intersectObjects(targets, false)[0];
    if (hit) pick(hit.object.userData);
  };
  const pick = (data: Record<string, unknown>) => {
    const floor = (data.floor as string | undefined) ?? '';
    const floorName = campus.floors.get(floor)?.userData.name as string | undefined;
    const sos = data.roomId ? lastLive.pins?.some(p => p.kind === 'sos' && snap.nodes.find(n => n.id === p.nodeId)?.room_id === data.roomId) : undefined;
    const info = { ...data, baseMaterial: undefined, floorName, sos };
    bar?.showRoom(info);
    opts.onPick?.(info);
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  const viewer: Viewer = {
    get campus() { return campus; },
    camera,
    update(live) { lastLive = live; applyStatus(campus, snap, live); reshadow(); render(); },
    route(route) {
      lastRoute = route;
      showRoute(campus, route);
      s.hasRoute = campus.overlay.route.children.length > 0;
      if (!s.hasRoute && s.view === 'route') s.view = '3d';
      reshadow();
      render();
      kick();
      changed();
    },
    explode(factor) {
      s.explode = factor;
      explode(campus, factor);
      placeName();
      applyStatus(campus, snap, lastLive);
      showRoute(campus, lastRoute);
      applyStyles();
      render();
      changed();
      // Refit once the slider settles, so the spread-out building stays in view.
      clearTimeout(refitTimer);
      refitTimer = setTimeout(refit, 200);
    },
    setBuilding(id) {
      if (id === s.building) return;
      s.level = null;
      build(id);
      frameView();
      changed();
    },
    setFloor(level) {
      s.level = level !== null && campus.floors.has(`${s.building}/${level}`) ? level : null; // a level from another building
      applyStyles();
      frameView();
      changed();
    },
    setView(view) {
      s.view = view;
      frameView();
      changed();
    },
    focusRoom(id) {
      const mesh = campus.rooms.get(id);
      if (!mesh) return;
      const floor = mesh.userData.floor as string;
      const level = campus.floors.get(floor)?.userData.level as number;
      if (s.level !== level) { s.level = level; applyStyles(); changed(); }
      const box = new THREE.Box3().setFromObject(mesh);
      const centre = box.getCenter(new THREE.Vector3());
      const size = Math.max(6, box.getSize(new THREE.Vector3()).length());
      fly(centre.clone().add(new THREE.Vector3(0.55, 0.9, 0.6).normalize().multiplyScalar(size * 1.6)), centre);
      pick(mesh.userData);
    },
    reset() {
      s.level = null;
      s.view = '3d';
      if (s.explode) { s.explode = 0; explode(campus, 0); placeName(); applyStatus(campus, snap, lastLive); showRoute(campus, lastRoute); }
      applyStyles();
      frameView();
      changed();
    },
    state: () => ({ ...s }),
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    dispose() {
      if (frame) caf(frame);
      clearTimeout(refitTimer);
      bar?.detach();
      observer?.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      disposeScene();
      renderer.dispose();
      (renderer as { forceContextLoss?: () => void }).forceContextLoss?.(); // free the WebGL context now, not at GC
      renderer.domElement.remove();
      labels.domElement.remove();
      style.remove();
      listeners.clear();
    },
  };
  bar = opts.controls === false ? null : attachControls(el, viewer, snap);
  return viewer;
}
