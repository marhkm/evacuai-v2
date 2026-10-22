import type { Point, Room } from '@evacuai/routing';
import * as THREE from 'three';

export const SLAB_M = 0.15;
const INLAY_M = 0.03;

/** The floor slab under a floor: its outline's bounding box plus a 0.5 m margin, `SLAB_M` thick, top at `y`. */
export function slab(box: THREE.Box3, y: number, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.BoxGeometry(box.max.x - box.min.x + 1, SLAB_M, box.max.z - box.min.z + 1);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set((box.min.x + box.max.x) / 2, y - SLAB_M / 2, (box.min.z + box.max.z) / 2);
  mesh.name = 'slab';
  mesh.receiveShadow = true;
  return mesh;
}

/** A room as a thin tinted inlay on the floor (the room's own polygon), top at `y` + a few centimetres. */
export function roomInlay(room: Room, dx: number, dz: number, y: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape(room.polygon.map(([x, z]) => new THREE.Vector2(x + dx, z + dz)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: INLAY_M, bevelEnabled: false });
  geo.rotateX(Math.PI / 2); // shape plane XY → XZ; extrusion now points down
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y + INLAY_M;
  mesh.receiveShadow = true;
  return mesh;
}

/** Door swings from the poster as thin arcs on the floor. */
export function doorArcs(doors: { hinge: Point; r: number; from: number; to: number }[], dx: number, dz: number, y: number, material: THREE.LineBasicMaterial): THREE.LineSegments {
  const pts: number[] = [];
  const rad = (d: number) => (d * Math.PI) / 180;
  for (const d of doors) {
    const sweep = ((d.to - d.from + 540) % 360) - 180;
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const a = rad(d.from + (sweep * i) / steps);
      const b = rad(d.from + (sweep * (i + 1)) / steps);
      pts.push(d.hinge[0] + dx + d.r * Math.cos(a), y, d.hinge[1] + dz + d.r * Math.sin(a), d.hinge[0] + dx + d.r * Math.cos(b), y, d.hinge[1] + dz + d.r * Math.sin(b));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(geo, material);
  lines.name = 'doors';
  return lines;
}
