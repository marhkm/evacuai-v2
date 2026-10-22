import * as THREE from 'three';

const REPEAT_M = 1.5; // one chevron every 1.5 m, like the poster arrows

let texture: THREE.CanvasTexture | null | undefined;
/** White chevrons on red, drawn once on a canvas (none in Node: tests get a plain red ribbon). */
function chevronTexture(): THREE.CanvasTexture | null {
  if (texture !== undefined) return texture;
  if (typeof document === 'undefined') return (texture = null);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  if (!g) return (texture = null);
  g.fillStyle = '#D7263D';
  g.fillRect(0, 0, 64, 32);
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = 5;
  g.lineJoin = 'miter';
  g.beginPath();
  g.moveTo(22, 6);
  g.lineTo(40, 16);
  g.lineTo(22, 26);
  g.stroke();
  texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

let material: THREE.MeshBasicMaterial | null = null;
export function ribbonMaterial(): THREE.MeshBasicMaterial {
  if (material) return material;
  const map = chevronTexture();
  material = new THREE.MeshBasicMaterial({ color: map ? 0xffffff : 0xd7263d, map, side: THREE.DoubleSide, depthTest: false, transparent: true });
  material.userData.shared = true; // one for every ribbon and viewer
  return material;
}

/** Moves the chevrons along the route (call per frame while a route is shown). */
export function scrollRibbons(dt: number): void {
  const map = chevronTexture();
  if (map) map.offset.x = (map.offset.x - dt * 0.8) % 1;
}

/**
 * A flat ribbon `width` wide along `points` (y taken from the points), with UVs that repeat a chevron every
 * `REPEAT_M` metres so the arrows keep their size whatever the route length.
 */
export function routeRibbon(points: THREE.Vector3[], width = 0.6): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  let along = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dir = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width / 2);
    if (i > 0) along += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    pos.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z);
    uv.push(along / REPEAT_M, 1, along / REPEAT_M, 0);
    if (i > 0) {
      const a = (i - 1) * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, ribbonMaterial());
  mesh.name = 'ribbon';
  mesh.renderOrder = 11;
  mesh.userData = { length: along, end: points.at(-1)!.clone() };
  return mesh;
}
