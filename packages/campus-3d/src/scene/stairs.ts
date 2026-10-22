import type { Point } from '@evacuai/routing';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A stair flight inside the stair polygon's bounding box: `steps` blocks rising along its longer side, so the stairs
 * read as stairs from any angle. Bottom at y = 0, top at `height`.
 */
export function stairSteps(poly: Point[], opts: { dx: number; dz: number; height: number; steps?: number }): THREE.BufferGeometry {
  const n = opts.steps ?? 12;
  const xs = poly.map(p => p[0]);
  const zs = poly.map(p => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const alongX = x1 - x0 >= z1 - z0;
  const run = (alongX ? x1 - x0 : z1 - z0) / n;
  const width = alongX ? z1 - z0 : x1 - x0;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const h = (opts.height * (i + 1)) / n;
    const box = alongX ? new THREE.BoxGeometry(run, h, width) : new THREE.BoxGeometry(width, h, run);
    const cx = alongX ? x0 + run * (i + 0.5) : (x0 + x1) / 2;
    const cz = alongX ? (z0 + z1) / 2 : z0 + run * (i + 0.5);
    parts.push(box.translate(cx + opts.dx, h / 2, cz + opts.dz));
  }
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/** Bounding box of a stair polygon, for the glass core around the flight. */
export function stairCore(poly: Point[], opts: { dx: number; dz: number; height: number }): THREE.BufferGeometry {
  const xs = poly.map(p => p[0]);
  const zs = poly.map(p => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  return new THREE.BoxGeometry(x1 - x0 + 0.1, opts.height, z1 - z0 + 0.1).translate((x0 + x1) / 2 + opts.dx, opts.height / 2, (z0 + z1) / 2 + opts.dz);
}
