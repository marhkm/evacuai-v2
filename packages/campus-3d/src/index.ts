import type { CampusNode, CampusSnapshot, EdgeStatus, Route } from '@evacuai/routing';
import * as THREE from 'three';

/**
 * Campus in 3D (spec §3.4). World axes: x = plan x (m), z = plan y (m), y = up (elevation).
 * Flat shading, no textures. Room meshes share materials; status/route/pins are overlays updated in place.
 */
export interface Campus3D {
  scene: THREE.Scene;
  /** One group per floor, keyed "<building>/<level>"; toggle `.visible` to peel floors. */
  floors: Map<string, THREE.Group>;
  /** Room meshes keyed by room id (`userData.roomId` set on each). */
  rooms: Map<string, THREE.Mesh>;
  /** World position of each graph node (a little above its floor). */
  nodePos: Map<string, THREE.Vector3>;
  overlay: { edges: THREE.Group; route: THREE.Group; pins: THREE.Group };
  bounds: THREE.Box3;
}

export interface LiveState {
  edges?: Record<string, EdgeStatus>; // non-open edges only; when given, every edge not listed is open. Omit to use the snapshot's.
  hazardRoomIds?: string[];
  roomCounts?: Record<string, number>; // people last seen per room → heat colour
  pins?: { id: string; nodeId: string; kind: 'sos' | 'checkin'; label?: string }[];
}

export const COLORS = {
  room: 0xcfe3d4, corridor: 0xf2f2f2, stairwell: 0xb9d0ec, exit: 0x9fd8ae, hazard: 0xe74c3c, slab: 0xbfc6c2,
  blocked: 0xc0392b, congested: 0xe67e22, route: 0x0b6bcb, sos: 0xd0021b, checkin: 0x1a7a3c,
  heat: [0xfff3b0, 0xffc56b, 0xff8a3d, 0xe8452c] as const, // 1, 2–4, 5–9, 10+ people
};

const ROOM_HEIGHT = 0.8; // share of the floor height drawn as walls (lets you see into rooms from above)
const GAP_M = 12; // spacing between buildings that have no geo origin yet

const heatColor = (n: number) => COLORS.heat[n >= 10 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0];
const roomColor = (type: string) => (COLORS as Record<string, unknown>)[type] as number | undefined ?? COLORS.room;

function material(color: number, opacity = 1): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, flatShading: true, depthWrite: opacity >= 1 });
}

export function buildScene(snap: CampusSnapshot): Campus3D {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(30, 60, 20);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2), sun);

  // ponytail: buildings without a geo origin are laid out side by side; place them by lat/lng + rotation once surveyed.
  const offsets = new Map<string, number>();
  let cursor = 0;
  for (const b of snap.buildings) {
    const xs = snap.rooms.filter(r => r.building === b.id).flatMap(r => r.polygon.map(p => p[0]));
    offsets.set(b.id, cursor - (xs.length ? Math.min(...xs) : 0));
    cursor += (xs.length ? Math.max(...xs) - Math.min(...xs) : 0) + GAP_M;
  }

  const floors = new Map<string, THREE.Group>();
  const rooms = new Map<string, THREE.Mesh>();
  const materials = new Map<string, THREE.Material>();
  const shared = (key: string, make: () => THREE.Material) => materials.get(key) ?? materials.set(key, make()).get(key)!;

  for (const b of snap.buildings) {
    const dx = offsets.get(b.id)!;
    for (const f of b.floors) {
      const group = new THREE.Group();
      group.name = `${b.id}/${f.level}`;
      group.userData = { building: b.id, level: f.level, name: f.name };
      const floorRooms = snap.rooms.filter(r => r.building === b.id && r.level === f.level);
      for (const r of floorRooms) {
        const shape = new THREE.Shape(r.polygon.map(([x, y]) => new THREE.Vector2(x + dx, y)));
        const flat = r.type === 'corridor';
        const h = flat ? 0.05 : f.height_m * ROOM_HEIGHT;
        const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
        geo.rotateX(Math.PI / 2); // shape plane XY → XZ; extrusion now points down
        const mesh = new THREE.Mesh(geo, shared(r.type, () => material(roomColor(r.type), flat ? 1 : 0.45)));
        mesh.position.y = f.elevation_m + h;
        mesh.userData = { roomId: r.id, name: r.name, baseMaterial: mesh.material };
        rooms.set(r.id, mesh);
        group.add(mesh);
      }
      if (floorRooms.length) { // slab under the floor
        const box = new THREE.Box3().setFromObject(group);
        const slab = new THREE.Mesh(new THREE.BoxGeometry(box.max.x - box.min.x + 1, 0.15, box.max.z - box.min.z + 1), shared('slab', () => material(COLORS.slab, 0.6)));
        slab.position.set((box.min.x + box.max.x) / 2, f.elevation_m - 0.08, (box.min.z + box.max.z) / 2);
        group.add(slab);
      }
      floors.set(group.name, group);
      scene.add(group);
    }
  }

  const nodePos = new Map<string, THREE.Vector3>();
  const elevation = (n: CampusNode) => snap.buildings.find(b => b.id === n.building)?.floors.find(f => f.level === n.level)?.elevation_m ?? 0;
  for (const n of snap.nodes) nodePos.set(n.id, new THREE.Vector3(n.x + (offsets.get(n.building) ?? 0), elevation(n) + 0.4, n.y));

  const overlay = { edges: new THREE.Group(), route: new THREE.Group(), pins: new THREE.Group() };
  for (const g of Object.values(overlay)) g.renderOrder = 10; // after the translucent rooms
  scene.add(overlay.edges, overlay.route, overlay.pins);

  const campus: Campus3D = { scene, floors, rooms, nodePos, overlay, bounds: new THREE.Box3().setFromObject(scene) };
  applyStatus(campus, snap, {});
  return campus;
}

function clear(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse(o => {
      const geo = (o as THREE.Mesh).geometry;
      if (geo && geo !== pinGeometry) geo.dispose(); // pins share one geometry
    });
  }
}

/** Hazard rooms (red), crowd heat, blocked/congested paths and SOS/check-in pins. Never rebuilds room geometry. */
export function applyStatus(c: Campus3D, snap: CampusSnapshot, live: LiveState): void {
  const hazards = new Set(live.hazardRoomIds ?? snap.hazardRoomIds);
  for (const [id, mesh] of c.rooms) {
    const count = live.roomCounts?.[id] ?? 0;
    mesh.material = hazards.has(id) ? hazardMaterial : count > 0 ? heatMaterials[COLORS.heat.indexOf(heatColor(count))] : mesh.userData.baseMaterial;
    mesh.userData.count = count;
    mesh.userData.hazard = hazards.has(id);
  }

  clear(c.overlay.edges);
  // Tubes, not 1 px lines: a blocked stair must be visible through the walls.
  for (const status of ['blocked', 'congested'] as const) {
    const group = new THREE.Group();
    group.name = status;
    for (const e of snap.edges) {
      if ((live.edges ? live.edges[e.id] ?? 'open' : e.status) !== status) continue;
      const a = c.nodePos.get(e.from);
      const b = c.nodePos.get(e.to);
      if (!a || !b) continue;
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, 0.25, 6, false), status === 'blocked' ? blockedMaterial : congestedMaterial);
      tube.renderOrder = 10;
      tube.userData = { edgeId: e.id, label: `${status === 'blocked' ? 'Blocked' : 'Congested'} path` };
      group.add(tube);
    }
    group.userData.count = group.children.length;
    if (group.children.length) c.overlay.edges.add(group);
  }

  clear(c.overlay.pins);
  for (const p of live.pins ?? []) {
    const at = c.nodePos.get(p.nodeId);
    if (!at) continue;
    const pin = new THREE.Mesh(pinGeometry, p.kind === 'sos' ? sosMaterial : checkinMaterial);
    pin.renderOrder = 11;
    pin.position.copy(at).add(new THREE.Vector3(0, 1.6, 0));
    pin.userData = { pinId: p.id, kind: p.kind, label: p.label };
    c.overlay.pins.add(pin);
  }
}

/** Evacuation route as a tube through the graph nodes (crosses floors via the stairs). Null clears it. */
export function showRoute(c: Campus3D, route: Route | null): void {
  clear(c.overlay.route);
  const points = route?.nodeIds.map(id => c.nodePos.get(id)).filter((p): p is THREE.Vector3 => !!p) ?? [];
  if (points.length < 2) return;
  const path = new THREE.CurvePath<THREE.Vector3>();
  points.slice(1).forEach((p, i) => path.add(new THREE.LineCurve3(points[i], p)));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(path, points.length * 8, 0.3, 6, false), routeMaterial);
  tube.name = 'route';
  tube.renderOrder = 10;
  c.overlay.route.add(tube);
}

/** Total triangles in the scene (spec budget: under 50K for the whole campus). */
export function triangleCount(c: Campus3D): number {
  let n = 0;
  c.scene.traverse(o => {
    const g = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry : null;
    if (g) n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
}

const hazardMaterial = material(COLORS.hazard, 0.8);
const heatMaterials = COLORS.heat.map(c => material(c, 0.8));
// Overlays draw on top of the building (no depth test): a blocked stair or an SOS must never hide behind walls.
const overlayMaterial = (color: number) => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
const routeMaterial = overlayMaterial(COLORS.route);
const blockedMaterial = overlayMaterial(COLORS.blocked);
const congestedMaterial = overlayMaterial(COLORS.congested);
const sosMaterial = overlayMaterial(COLORS.sos);
const checkinMaterial = overlayMaterial(COLORS.checkin);
const pinGeometry = new THREE.ConeGeometry(0.6, 1.6, 8).rotateX(Math.PI); // points down at the spot
