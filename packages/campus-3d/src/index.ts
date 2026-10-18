import { routeChevrons } from '@evacuai/campus-view';
import type { CampusNode, CampusSnapshot, EdgeStatus, Point, Route } from '@evacuai/routing';
import * as THREE from 'three';

/**
 * Campus in 3D (spec §3.4). World axes: x = plan x (m), z = plan y (m), y = up (elevation).
 * Flat shading, no textures. Walls are the lines traced from the evacuation posters (room outlines where a floor has
 * no traced plan), raised as thin panels; rooms are tinted floor tiles; status/route/pins are overlays updated in place.
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
  /** x offset per building (buildings without a geo origin are laid out side by side). */
  offsets: Map<string, number>;
  /** Unexploded node positions and each node's floor key, for explode(). */
  basePos: Map<string, THREE.Vector3>;
  nodeFloor: Map<string, string>;
  exits: Set<string>;
}

export interface LiveState {
  edges?: Record<string, EdgeStatus>; // non-open edges only; when given, every edge not listed is open. Omit to use the snapshot's.
  hazardRoomIds?: string[];
  roomCounts?: Record<string, number>; // people last seen per room → heat colour
  pins?: { id: string; nodeId: string; kind: 'sos' | 'checkin'; label?: string }[];
}

export const COLORS = {
  room: 0xcfe3d4, corridor: 0xf2f2f2, stairwell: 0xb9d0ec, exit: 0x9fd8ae, hazard: 0xe74c3c, slab: 0xbfc6c2,
  blocked: 0x2b2f36, congested: 0xf2a900, route: 0xd7263d, wall: 0x3a3f47, sos: 0xd0021b, checkin: 0x1a7a3c,
  heat: [0xfff3b0, 0xffc56b, 0xff8a3d, 0xe8452c] as const, // 1, 2–4, 5–9, 10+ people
};

const WALL_HEIGHT = 0.6; // share of the floor height drawn as walls (lets you see into rooms from above)
const TILE_M = 0.05; // rooms are tinted floor tiles
const EXPLODE_M = 2; // extra metres per floor and per unit of explode()
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
    const xs = [
      ...snap.rooms.filter(r => r.building === b.id).flatMap(r => r.polygon.map(p => p[0])),
      ...b.floors.flatMap(f => f.plan?.walls.flat().map(p => p[0]) ?? []),
    ];
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
        const geo = new THREE.ExtrudeGeometry(shape, { depth: TILE_M, bevelEnabled: false });
        geo.rotateX(Math.PI / 2); // shape plane XY → XZ; extrusion now points down
        const mesh = new THREE.Mesh(geo, shared(r.type, () => material(roomColor(r.type), 0.55)));
        mesh.position.y = f.elevation_m + TILE_M;
        mesh.userData = { roomId: r.id, name: r.name, baseMaterial: mesh.material };
        rooms.set(r.id, mesh);
        group.add(mesh);
      }
      const wallLines: Point[][] = f.plan?.walls ?? floorRooms.map(r => r.polygon);
      if (wallLines.length) group.add(wallMesh(wallLines, dx, f.elevation_m, f.height_m * WALL_HEIGHT));
      if (group.children.length) { // slab under the floor
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
  const basePos = new Map<string, THREE.Vector3>();
  const nodeFloor = new Map<string, string>();
  const exits = new Set(snap.nodes.filter(n => n.type === 'exit').map(n => n.id));
  const elevation = (n: CampusNode) => snap.buildings.find(b => b.id === n.building)?.floors.find(f => f.level === n.level)?.elevation_m ?? 0;
  for (const n of snap.nodes) {
    const p = new THREE.Vector3(n.x + (offsets.get(n.building) ?? 0), elevation(n) + 0.4, n.y);
    basePos.set(n.id, p.clone());
    nodePos.set(n.id, p);
    nodeFloor.set(n.id, `${n.building}/${n.level}`);
  }

  const overlay = { edges: new THREE.Group(), route: new THREE.Group(), pins: new THREE.Group() };
  for (const g of Object.values(overlay)) g.renderOrder = 10; // after the translucent rooms
  scene.add(overlay.edges, overlay.route, overlay.pins);

  const campus: Campus3D = { scene, floors, rooms, nodePos, overlay, bounds: new THREE.Box3().setFromObject(scene), offsets, basePos, nodeFloor, exits };
  applyStatus(campus, snap, {});
  return campus;
}

function clear(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse(o => {
      const geo = (o as THREE.Mesh).geometry;
      if (geo && geo !== pinGeometry && geo !== arrowGeometry) geo.dispose(); // pins and arrows share one geometry each
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

/**
 * Evacuation route as the posters draw it: red chevrons on each floor, joined by a thin red line that also climbs
 * the stairs between floors. Null clears it.
 */
export function showRoute(c: Campus3D, route: Route | null): void {
  clear(c.overlay.route);
  const known = route?.nodeIds.filter(id => c.nodePos.has(id)) ?? [];
  const exit = known.findIndex(id => c.exits.has(id));
  const ids = exit < 0 ? known : known.slice(0, exit + 1); // the assembly area is off the model
  const points = ids.map(id => c.nodePos.get(id)!);
  if (points.length < 2) return;
  const path = new THREE.CurvePath<THREE.Vector3>();
  points.slice(1).forEach((p, i) => path.add(new THREE.LineCurve3(points[i], p)));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(path, points.length * 8, 0.08, 4, false), routeMaterial);
  tube.name = 'route';
  tube.renderOrder = 10;

  const arrows = new THREE.Group();
  arrows.name = 'arrows';
  let run: string[] = [];
  ids.forEach((id, i) => {
    run.push(id);
    const next = ids[i + 1];
    if (next && c.nodeFloor.get(next) === c.nodeFloor.get(id)) return;
    const base = run.map(r => c.basePos.get(r)!);
    const lift = c.nodePos.get(run[0])!.y - base[0].y; // current explode offset of this floor
    for (const ch of routeChevrons(base.map(p => [p.x, p.z] as Point))) {
      const arrow = new THREE.Mesh(arrowGeometry, routeMaterial);
      arrow.position.set(ch.x, base[0].y - 0.3 + lift, ch.y);
      arrow.rotation.y = (-ch.deg * Math.PI) / 180;
      arrow.renderOrder = 11;
      arrows.add(arrow);
    }
    run = [];
  });
  c.overlay.route.add(tube, arrows);
}

/** Spreads the floors apart (0 = real heights) so lower floors can be seen; re-draw the route afterwards. */
export function explode(c: Campus3D, factor: number): void {
  const rank = new Map<string, number>();
  const byBuilding = new Map<string, THREE.Group[]>();
  for (const g of c.floors.values()) byBuilding.set(g.userData.building, [...(byBuilding.get(g.userData.building) ?? []), g]);
  for (const groups of byBuilding.values()) {
    groups.sort((a, b) => a.userData.level - b.userData.level).forEach((g, i) => rank.set(g.name, i));
  }
  for (const [key, g] of c.floors) g.position.y = (rank.get(key) ?? 0) * factor * EXPLODE_M;
  for (const [id, base] of c.basePos) {
    const g = c.floors.get(c.nodeFloor.get(id)!);
    c.nodePos.get(id)!.set(base.x, base.y + (g?.position.y ?? 0), base.z);
  }
}

/** Thin vertical panels (2 triangles each) for every wall piece of one floor, merged into one mesh. */
function wallMesh(lines: Point[][], dx: number, floorY: number, height: number): THREE.Mesh {
  const pos: number[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1];
      const [bx, bz] = line[i];
      const [x1, x2, y0, y1] = [ax + dx, bx + dx, 0, height];
      pos.push(x1, y0, az, x2, y0, bz, x2, y1, bz, x1, y0, az, x2, y1, bz, x1, y1, az);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, wallMaterial);
  mesh.name = 'walls';
  mesh.position.y = floorY;
  return mesh;
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
const wallMaterial = new THREE.MeshLambertMaterial({ color: COLORS.wall, side: THREE.DoubleSide });
// Flat chevron lying on the floor, pointing along +x (rotated per arrow).
const arrowGeometry = new THREE.ShapeGeometry(new THREE.Shape([
  new THREE.Vector2(-0.55, -0.6), new THREE.Vector2(0.55, 0), new THREE.Vector2(-0.55, 0.6), new THREE.Vector2(-0.2, 0),
])).rotateX(Math.PI / 2);
