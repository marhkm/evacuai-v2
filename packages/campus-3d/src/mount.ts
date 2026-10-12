import type { CampusSnapshot, Route } from '@evacuai/routing';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { applyStatus, buildScene, showRoute, type Campus3D, type LiveState } from './index';

export interface Viewer {
  campus: Campus3D;
  update(live: LiveState): void;
  route(route: Route | null): void;
  /** Show only floors at or below this level of each building (null = all). */
  peel(level: number | null): void;
  dispose(): void;
}

export const webglAvailable = (): boolean => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
};

/**
 * Renders the campus into `el` with orbit/pinch controls. Renders on demand (no idle animation loop) to save
 * battery on phones and CPU on lab PCs. Clicking a room or pin calls onPick with its details.
 */
export function mount(el: HTMLElement, snap: CampusSnapshot, opts: { onPick?: (info: Record<string, unknown>) => void } = {}): Viewer {
  const campus = buildScene(snap);
  campus.scene.background = new THREE.Color(0xf4f7f5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';

  const center = campus.bounds.getCenter(new THREE.Vector3());
  const size = campus.bounds.getSize(new THREE.Vector3()).length() || 50;
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, size * 10);
  // Fit the bounding sphere (radius size/2) in the 45° view, looking down from the south-east.
  camera.position.copy(center).addScaledVector(new THREE.Vector3(0.45, 0.6, 0.66).normalize(), (size / 2) / Math.sin(Math.PI / 8));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.update(); // aim at the target now (the constructor aimed at the origin)
  controls.maxPolarAngle = Math.PI / 2.05; // never go under the ground

  const render = () => renderer.render(campus.scene, camera);
  controls.addEventListener('change', render);
  const resize = () => {
    const w = el.clientWidth || 300;
    const h = el.clientHeight || 300;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(el);
  resize();

  const ray = new THREE.Raycaster();
  let down: [number, number] | null = null;
  const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !opts.onPick) return; // a drag, not a tap
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const targets = [...campus.overlay.pins.children, ...campus.overlay.edges.children.flatMap(g => g.children), ...[...campus.rooms.values()].filter(m => m.parent?.visible)];
    const hit = ray.intersectObjects(targets, false)[0];
    if (hit) opts.onPick({ ...hit.object.userData, baseMaterial: undefined });
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  return {
    campus,
    update(live) { applyStatus(campus, snap, live); render(); },
    route(route) { showRoute(campus, route); render(); },
    peel(level) {
      for (const g of campus.floors.values()) g.visible = level === null || g.userData.level <= level;
      render();
    },
    dispose() {
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
