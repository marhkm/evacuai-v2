import type { Point } from '@evacuai/routing';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MIN_SEGMENT_M = 0.05; // tracing noise, not a wall

/**
 * Real walls: every segment of the floor's wall lines as a box `thickness` thick and `height` tall, merged into one
 * geometry (one draw call per floor). Ends overlap by half the thickness so corners close. Bottom at y = 0.
 */
export function thickWalls(lines: Point[][], opts: { dx: number; dz: number; height: number; thickness?: number }): THREE.BufferGeometry {
  const t = opts.thickness ?? 0.15;
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1];
      const [bx, bz] = line[i];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < MIN_SEGMENT_M) continue;
      const box = new THREE.BoxGeometry(len + t, opts.height, t);
      m.makeRotationY(-Math.atan2(bz - az, bx - ax)).setPosition((ax + bx) / 2 + opts.dx, opts.height / 2, (az + bz) / 2 + opts.dz);
      parts.push(box.applyMatrix4(m));
    }
  }
  const merged = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
  for (const p of parts) p.dispose();
  return merged;
}
