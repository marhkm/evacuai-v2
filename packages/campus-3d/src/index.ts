import { routeChevrons } from '@evacuai/campus-view';
import type { CampusNode, CampusSnapshot, EdgeStatus, Point, Route } from '@evacuai/routing';
import * as THREE from 'three';

import { doorArcs, roomInlay, slab, SLAB_M } from './scene/floors';
import { routeRibbon, scrollRibbons } from './scene/route';
import { stairCore, stairSteps } from './scene/stairs';
import { thickWalls } from './scene/walls';
import type { FloorKey, FloorStyle } from './views';

export * from './views';

/**
 * One building in 3D as an architectural model (spec 2026-10-23). World axes: x = plan x (m), z = plan y (m), y = up.
 * The building is centred on the origin. Walls are the lines traced from the evacuation posters (room outlines where a
 * floor has no traced plan), raised full height and 0.15 m thick; rooms are tinted floor inlays; status, route and pins
 * are overlays updated in place.
 */
export interface Campus3D {
  scene: THREE.Scene;
  /** The building this scene shows (one building per scene). */
  building: string;
  /** One group per floor, keyed "<building>/<level>". */
  floors: Map<FloorKey, THREE.Group>;
  /** Room inlays keyed by room id (`userData.roomId`, `userData.floor` set on each). */
  rooms: Map<string, THREE.Mesh>;
  /** World position of each graph node of this building (a little above its floor). */
  nodePos: Map<string, THREE.Vector3>;
  overlay: { edges: THREE.Group; route: THREE.Group; pins: THREE.Group };
  bounds: THREE.Box3;
  /** Unexploded node positions and each node's floor key, for explode(). */
  basePos: Map<string, THREE.Vector3>;
  nodeFloor: Map<string, FloorKey>;
  exits: Set<string>;
  /** Anchor points for DOM labels (made by mount): the building name, and every room's name. */
  labels: { building: Map<string, THREE.Vector3>; rooms: Map<string, { pos: THREE.Vector3; name: string; floor: FloorKey }> };
  /** Floor visibility and opacity (see views.floorStyles); kept across applyStatus and showRoute. */
  setFloorStyles(styles: Map<FloorKey, FloorStyle>): void;
  styles: Map<FloorKey, FloorStyle> | null;
  /** Hazard / heat material for one floor (one per floor and kind, so a ghosted floor keeps its opacity). */
  statusMaterial(floor: FloorKey, kind: string, color: number): THREE.Material;
  /** Frees every material this scene owns, attached to a mesh right now or not (floors' own and status ones). */
  disposeMaterials(): void;
}

export interface LiveState {
  edges?: Record<string, EdgeStatus>; // non-open edges only; when given, every edge not listed is open. Omit to use the snapshot's.
  hazardRoomIds?: string[];
  roomCounts?: Record<string, number>; // people last seen per room → heat colour
  pins?: { id: string; nodeId: string; kind: 'sos' | 'checkin'; label?: string }[];
}

export const COLORS = {
  // Architectural model: warm off-white walls, pale slabs, softly tinted rooms.
  wall: 0xf4f1ea, slab: 0xe3e6ea, ground: 0xeef1ec, grid: 0xd9ded6, door: 0x8a94a3, glass: 0x9cc3e6, stairs: 0xc9cfd8,
  room: 0xe8ede6, classroom: 0xddebf7, office: 0xf3e8d6, lab: 0xe5ddf2, corridor: 0xf7f7f5, stairwell: 0xcfe0f5, exit: 0xcdebd6,
  hazard: 0xe74c3c, blocked: 0x2b2f36, congested: 0xf2a900, route: 0xd7263d, sos: 0xd0021b, checkin: 0x1a7a3c,
  heat: [0xfff3b0, 0xffc56b, 0xff8a3d, 0xe8452c] as const, // 1, 2–4, 5–9, 10+ people
};

const EXPLODE_M = 2; // extra metres per floor and per unit of explode()

const heatColor = (n: number) => COLORS.heat[n >= 10 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0];
const roomColor = (type: string) => (COLORS as Record<string, unknown>)[type] as number | undefined ?? COLORS.room;
const standard = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

/** Builds one building (default: the first in the snapshot), centred on the origin. */
export function buildScene(snap: CampusSnapshot, opts: { building?: string } = {}): Campus3D {
  const b = snap.buildings.find(x => x.id === opts.building) ?? snap.buildings[0];
  const scene = new THREE.Scene();
  const buildingRooms = snap.rooms.filter(r => r.building === b.id);

  // Centre the building on the origin.
  const pts = [...buildingRooms.flatMap(r => r.polygon), ...b.floors.flatMap(f => f.plan?.walls.flat() ?? [])];
  const xs = pts.map(p => p[0]);
  const zs = pts.map(p => p[1]);
  const dx = pts.length ? -(Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const dz = pts.length ? -(Math.min(...zs) + Math.max(...zs)) / 2 : 0;

  const floors = new Map<FloorKey, THREE.Group>();
  const rooms = new Map<string, THREE.Mesh>();
  const labels: Campus3D['labels'] = { building: new Map(), rooms: new Map() };

  for (const f of b.floors) {
    const key = `${b.id}/${f.level}`;
    const group = new THREE.Group();
    group.name = key;
    group.userData = { building: b.id, level: f.level, name: f.name, materials: [] as THREE.Material[] };
    // Each floor owns its materials, so one floor can be ghosted or hidden without touching the others.
    const own = <M extends THREE.Material>(m: M, baseOpacity = 1): M => {
      m.userData.baseOpacity = baseOpacity;
      if (baseOpacity < 1) Object.assign(m, { transparent: true, opacity: baseOpacity, depthWrite: false });
      group.userData.materials.push(m);
      return m;
    };
    const byType = new Map<string, THREE.Material>();
    const floorRooms = buildingRooms.filter(r => r.level === f.level);
    for (const r of floorRooms) {
      const mat = byType.get(r.type) ?? byType.set(r.type, own(standard(roomColor(r.type)))).get(r.type)!;
      const mesh = roomInlay(r, dx, dz, f.elevation_m, mat);
      mesh.userData = { roomId: r.id, name: r.name, floor: key, baseMaterial: mat };
      rooms.set(r.id, mesh);
      group.add(mesh);
      if (r.type !== 'corridor') {
        const c = centroid(r.polygon);
        labels.rooms.set(r.id, { pos: new THREE.Vector3(c[0] + dx, f.elevation_m + 0.6, c[1] + dz), name: r.name, floor: key });
      }
    }

    const wallLines: Point[][] = f.plan?.walls ?? floorRooms.filter(r => r.type !== 'corridor').map(r => [...r.polygon, r.polygon[0]]);
    const wallHeight = f.height_m - SLAB_M;
    if (wallLines.length) {
      const walls = new THREE.Mesh(thickWalls(wallLines, { dx, dz, height: wallHeight }), own(standard(COLORS.wall, { roughness: 0.9 })));
      walls.name = 'walls';
      walls.position.y = f.elevation_m;
      walls.castShadow = true;
      walls.receiveShadow = true;
      group.add(walls);
    }
    if (f.plan?.doors.length) group.add(doorArcs(f.plan.doors, dx, dz, f.elevation_m + 0.05, own(new THREE.LineBasicMaterial({ color: COLORS.door }))));

    const stairPolys = f.plan?.stairs.length ? f.plan.stairs : floorRooms.filter(r => r.type === 'stairwell').map(r => r.polygon);
    if (stairPolys.length) {
      const stairMat = own(standard(COLORS.stairs));
      const glassMat = own(standard(COLORS.glass, { roughness: 0.1 }), 0.18);
      for (const poly of stairPolys) {
        const steps = new THREE.Mesh(stairSteps(poly, { dx, dz, height: f.height_m }), stairMat);
        steps.name = 'stairs';
        steps.position.y = f.elevation_m;
        steps.castShadow = true;
        const core = new THREE.Mesh(stairCore(poly, { dx, dz, height: f.height_m }), glassMat);
        core.name = 'stair-core';
        core.position.y = f.elevation_m;
        group.add(steps, core);
      }
    }
    // The plate under the floor spans its bounding box (courtyards included), so it is a light, see-through plate.
    if (group.children.length) group.add(slab(new THREE.Box3().setFromObject(group), f.elevation_m, own(standard(COLORS.slab), 0.45)));
    floors.set(key, group);
    scene.add(group);
  }

  const nodePos = new Map<string, THREE.Vector3>();
  const basePos = new Map<string, THREE.Vector3>();
  const nodeFloor = new Map<string, FloorKey>();
  const nodes = snap.nodes.filter(n => n.building === b.id);
  const exits = new Set(nodes.filter(n => n.type === 'exit').map(n => n.id));
  const elevation = (n: CampusNode) => b.floors.find(f => f.level === n.level)?.elevation_m ?? 0;
  for (const n of nodes) {
    const p = new THREE.Vector3(n.x + dx, elevation(n) + 0.4, n.y + dz);
    basePos.set(n.id, p.clone());
    nodePos.set(n.id, p);
    nodeFloor.set(n.id, `${n.building}/${n.level}`);
  }

  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  labels.building.set(b.id, new THREE.Vector3(0, bounds.max.y + 2, 0));

  // Ground, light and fog: the model sits on a quiet ground plane in soft daylight.
  const span = Math.max(size.x, size.z) + 40;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2), standard(COLORS.ground, { roughness: 1 }));
  ground.name = 'ground';
  ground.position.y = (b.floors[0]?.elevation_m ?? 0) - SLAB_M - 0.01;
  ground.receiveShadow = true;
  const grid = new THREE.GridHelper(span, Math.round(span / 2), COLORS.grid, COLORS.grid);
  grid.name = 'grid';
  grid.position.y = ground.position.y + 0.005;
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.name = 'sun';
  sun.position.set(span * 0.4, span * 0.8, span * 0.3);
  const half = span / 2;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: span * 3 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  scene.add(ground, grid, new THREE.HemisphereLight(0xffffff, 0xb8c2cc, 1.2), sun);
  scene.fog = new THREE.Fog(COLORS.ground, span * 1.2, span * 3);

  const overlay = { edges: new THREE.Group(), route: new THREE.Group(), pins: new THREE.Group() };
  for (const g of Object.values(overlay)) g.renderOrder = 10; // after the translucent parts
  scene.add(overlay.edges, overlay.route, overlay.pins);

  const statusMats = new Map<string, THREE.MeshStandardMaterial>();
  const campus: Campus3D = {
    scene, building: b.id, floors, rooms, nodePos, overlay, bounds, basePos, nodeFloor, exits, labels, styles: null,
    disposeMaterials() {
      for (const g of floors.values()) for (const m of g.userData.materials as THREE.Material[]) m.dispose();
      for (const m of statusMats.values()) m.dispose();
      statusMats.clear();
    },
    statusMaterial(floor, kind, color) {
      const key = `${floor}|${kind}`;
      if (!statusMats.has(key)) statusMats.set(key, standard(color, kind === 'hazard' ? { emissive: COLORS.hazard, emissiveIntensity: 0.35 } : {}));
      return statusMats.get(key)!;
    },
    setFloorStyles(styles) {
      campus.styles = styles;
      for (const [key, g] of floors) {
        const st = styles.get(key) ?? { visible: true, opacity: 1, labels: false };
        g.visible = st.visible;
        const mats: THREE.Material[] = [...g.userData.materials, ...[...statusMats].filter(([k]) => k.startsWith(`${key}|`)).map(([, m]) => m)];
        for (const m of mats) {
          const opacity = (m.userData.baseOpacity ?? 1) * st.opacity;
          m.opacity = opacity;
          if (m.transparent !== opacity < 1) { m.transparent = opacity < 1; m.needsUpdate = true; } // new shader only then
          m.depthWrite = opacity >= 0.6; // nearly solid floors keep depth, or a floor's back walls show through its front

        }
      }
      for (const o of [...overlay.edges.children.flatMap(g => g.children), ...overlay.pins.children, ...overlay.route.children]) {
        if (o.userData.floor) o.visible = styles.get(o.userData.floor)?.visible ?? true;
      }
    },
  };
  applyStatus(campus, snap, {});
  return campus;
}

function centroid(poly: Point[]): Point {
  return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
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

/** Hazard rooms (red glow), crowd heat, blocked/congested paths and SOS/check-in pins. Never rebuilds room geometry. */
export function applyStatus(c: Campus3D, snap: CampusSnapshot, live: LiveState): void {
  const hazards = new Set(live.hazardRoomIds ?? snap.hazardRoomIds);
  for (const [id, mesh] of c.rooms) {
    const count = live.roomCounts?.[id] ?? 0;
    const floor = mesh.userData.floor as FloorKey;
    const heat = heatColor(count);
    mesh.material = hazards.has(id) ? c.statusMaterial(floor, 'hazard', COLORS.hazard)
      : count > 0 ? c.statusMaterial(floor, `heat${heat}`, heat) : mesh.userData.baseMaterial;
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
      tube.userData = { edgeId: e.id, label: `${status === 'blocked' ? 'Blocked' : 'Congested'} path`, floor: c.nodeFloor.get(e.from) };
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
    pin.userData = { pinId: p.id, kind: p.kind, label: p.label, floor: c.nodeFloor.get(p.nodeId) };
    c.overlay.pins.add(pin);
  }
  if (c.styles) c.setFloorStyles(c.styles);
}

/**
 * Evacuation route: on each floor a red ribbon with moving chevrons (plus the poster-style chevrons on the floor), and
 * a thin red link where the route changes floor (stairs). Each floor's part is a group "route-<floor>", hidden with
 * its floor. Only the part inside this building is drawn. Null clears it.
 */
export function showRoute(c: Campus3D, route: Route | null): void {
  clear(c.overlay.route);
  const known = route?.nodeIds.filter(id => c.nodePos.has(id)) ?? [];
  const exit = known.findIndex(id => c.exits.has(id));
  const ids = exit < 0 ? known : known.slice(0, exit + 1); // the assembly area is off the model
  if (ids.length < 2) return;

  let run: string[] = [];
  let last: THREE.Vector3 | null = null;
  ids.forEach((id, i) => {
    run.push(id);
    const next = ids[i + 1];
    if (next && c.nodeFloor.get(next) === c.nodeFloor.get(id)) return;
    const floor = c.nodeFloor.get(id)!;
    const group = new THREE.Group();
    group.name = `route-${floor}`;
    group.userData.floor = floor;
    const pts = run.map(r => c.nodePos.get(r)!.clone().setY(c.nodePos.get(r)!.y - 0.33));
    if (last) group.add(link(last, pts[0]));
    if (pts.length > 1) group.add(routeRibbon(pts));
    const base = run.map(r => c.basePos.get(r)!);
    const lift = c.nodePos.get(run[0])!.y - base[0].y; // current explode offset of this floor
    for (const ch of routeChevrons(base.map(p => [p.x, p.z] as Point))) {
      const arrow = new THREE.Mesh(arrowGeometry, routeMaterial);
      arrow.name = 'arrow';
      arrow.position.set(ch.x, base[0].y - 0.3 + lift, ch.y);
      arrow.rotation.y = (-ch.deg * Math.PI) / 180;
      arrow.renderOrder = 11;
      group.add(arrow);
    }
    c.overlay.route.add(group);
    last = pts.at(-1)!;
    run = [];
  });
  if (c.styles) c.setFloorStyles(c.styles);
}

/** Thin red tube where the route climbs or descends the stairs between floors. */
function link(a: THREE.Vector3, b: THREE.Vector3): THREE.Mesh {
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 4, 0.1, 6, false), routeMaterial);
  tube.name = 'route-link';
  tube.renderOrder = 10;
  return tube;
}

/** Moves the route chevrons; the viewer calls this every frame while a route is shown. */
export const routeTick = scrollRibbons;

/** Spreads the floors apart (0 = real heights) so lower floors can be seen; re-draw the route afterwards. */
export function explode(c: Campus3D, factor: number): void {
  const ordered = [...c.floors.values()].sort((a, b) => a.userData.level - b.userData.level);
  ordered.forEach((g, i) => { g.position.y = i * factor * EXPLODE_M; });
  for (const [id, base] of c.basePos) {
    const g = c.floors.get(c.nodeFloor.get(id)!);
    c.nodePos.get(id)!.set(base.x, base.y + (g?.position.y ?? 0), base.z);
  }
}

/** Total triangles in the scene (spec budget: under 120K for one building). */
export function triangleCount(c: Campus3D): number {
  let n = 0;
  c.scene.traverse(o => {
    const g = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry : null;
    if (g) n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
}

// Overlays draw on top of the building (no depth test): a blocked stair or an SOS must never hide behind walls.
const overlayMaterial = (color: number) => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
const routeMaterial = overlayMaterial(COLORS.route);
const blockedMaterial = overlayMaterial(COLORS.blocked);
const congestedMaterial = overlayMaterial(COLORS.congested);
const sosMaterial = overlayMaterial(COLORS.sos);
const checkinMaterial = overlayMaterial(COLORS.checkin);
const pinGeometry = new THREE.ConeGeometry(0.6, 1.6, 8).rotateX(Math.PI); // points down at the spot
for (const shared of [routeMaterial, blockedMaterial, congestedMaterial, sosMaterial, checkinMaterial, pinGeometry]) shared.userData.shared = true;
// Flat chevron lying on the floor, pointing along +x (rotated per arrow).
const arrowGeometry = new THREE.ShapeGeometry(new THREE.Shape([
  new THREE.Vector2(-0.55, -0.6), new THREE.Vector2(0.55, 0), new THREE.Vector2(-0.55, 0.6), new THREE.Vector2(-0.2, 0),
])).rotateX(Math.PI / 2);
arrowGeometry.userData.shared = true;
