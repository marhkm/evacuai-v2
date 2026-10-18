import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_WEIGHTS,
  type AssemblyPoint, type Building, type CampusNode, type CampusSnapshot, type Edge,
  type EdgeType, type Floor, type FloorPlan, type Hazard, type NodeType, type Point, type Room,
} from './types';

interface RawCampus { name: string; buildings: string[]; assembly_points: AssemblyPoint[] }
interface RawBuilding extends Omit<Building, 'floors'> { floors: (Omit<Floor, 'height_m'> & { height_m?: number })[] }
interface RawFloor {
  rooms: { id: string; name: string; type: string; polygon: Point[] }[];
  nodes: {
    id: string; type: NodeType; x: number; y: number; name?: string; room_id?: string;
    safe_for?: Hazard[]; qr_id?: string; capacity?: number; occupancy?: number;
  }[];
  edges: { from: string; to: string; type: EdgeType; distance_m?: number; bidirectional?: boolean; flags?: string[] }[];
  plan?: FloorPlan;
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (err) {
    throw new Error(`${path}: ${(err as Error).message}`);
  }
}

// Hand-edited JSON: a typo'd key must fail loudly (a silent default can flip a one-way edge or drop a hazard room).
const KEYS = {
  campus: ['name', 'origin', 'buildings', 'assembly_points'],
  assemblyPoint: ['id', 'node_id', 'lat', 'lng', 'radius_m'],
  building: ['id', 'name', 'origin', 'rotation_deg', 'footprint', 'floors'],
  floorDef: ['level', 'name', 'elevation_m', 'height_m'],
  floor: ['rooms', 'nodes', 'edges', 'plan'],
  plan: ['walls', 'doors', 'stairs', 'labels', 'arrows'],
  room: ['id', 'name', 'type', 'polygon'],
  node: ['id', 'type', 'x', 'y', 'name', 'room_id', 'safe_for', 'qr_id', 'capacity', 'occupancy'],
  edge: ['from', 'to', 'type', 'distance_m', 'bidirectional', 'flags'],
};

function checkKeys(path: string, where: string, obj: object, allowed: string[], requiredArrays: string[] = []) {
  const at = where ? `${path}: ${where}:` : `${path}:`;
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) throw new Error(`${at} unknown key "${k}"`);
  for (const k of requiredArrays) {
    if (!Array.isArray((obj as Record<string, unknown>)[k])) throw new Error(`${at} missing "${k}"`);
  }
}

const checkList = (path: string, name: string, list: object[], allowed: string[]) =>
  list.forEach((item, i) => checkKeys(path, `${name}[${i}]`, item, allowed));

export function loadCampus(dir: string): CampusSnapshot {
  const campusPath = join(dir, 'campus.json');
  const campus = readJson<RawCampus>(campusPath);
  checkKeys(campusPath, '', campus, KEYS.campus, ['buildings', 'assembly_points']);
  checkList(campusPath, 'assembly_points', campus.assembly_points, KEYS.assemblyPoint);
  const buildings: Building[] = [];
  const rooms: Room[] = [];
  const nodes: CampusNode[] = [];
  const rawEdges: { building: string; level: number; edge: RawFloor['edges'][number] }[] = [];

  for (const bId of campus.buildings) {
    const bPath = join(dir, bId, 'building.json');
    const raw = readJson<RawBuilding>(bPath);
    checkKeys(bPath, '', raw, KEYS.building, ['floors']);
    checkList(bPath, 'floors', raw.floors, KEYS.floorDef);
    const floors = raw.floors.map(f => ({ ...f, height_m: f.height_m ?? 3.5 }));
    buildings.push({ ...raw, floors });
    for (const floor of floors) {
      const g = (id: string) => (id.includes('/') ? id : `${bId}/${floor.level}/${id}`);
      const fPath = join(dir, bId, `floor-${floor.level}.json`);
      const data = readJson<RawFloor>(fPath);
      checkKeys(fPath, '', data, KEYS.floor, ['rooms', 'nodes', 'edges']);
      checkList(fPath, 'rooms', data.rooms, KEYS.room);
      checkList(fPath, 'nodes', data.nodes, KEYS.node);
      checkList(fPath, 'edges', data.edges, KEYS.edge);
      if (data.plan) {
        checkKeys(fPath, 'plan', data.plan, KEYS.plan, KEYS.plan);
        floor.plan = data.plan;
      }
      for (const r of data.rooms) rooms.push({ ...r, id: g(r.id), building: bId, level: floor.level });
      for (const n of data.nodes) {
        nodes.push({
          ...n,
          id: g(n.id),
          building: bId,
          level: floor.level,
          room_id: n.room_id === undefined ? undefined : g(n.room_id),
          safe_for: n.safe_for ?? [],
        });
      }
      for (const e of data.edges) rawEdges.push({ building: bId, level: floor.level, edge: { ...e, from: g(e.from), to: g(e.to) } });
    }
  }

  const byId = new Map(nodes.map(n => [n.id, n]));
  const floorOf = (n: CampusNode) => buildings.find(b => b.id === n.building)!.floors.find(f => f.level === n.level)!;
  const edges: Edge[] = rawEdges.map(({ edge }) => {
    let distance_m = edge.distance_m;
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (distance_m === undefined && a && b) {
      distance_m = a.level === b.level
        ? Math.hypot(a.x - b.x, a.y - b.y)
        : 2 * floorOf(a.level > b.level ? a : b).height_m;
    }
    return {
      id: `${edge.from}->${edge.to}`,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      distance_m: distance_m ?? 0,
      bidirectional: edge.bidirectional ?? true,
      flags: edge.flags ?? [],
      status: 'open',
    };
  });

  return {
    name: campus.name,
    buildings,
    rooms,
    nodes,
    edges,
    assemblyPoints: campus.assembly_points,
    hazardRoomIds: [],
    weights: DEFAULT_WEIGHTS,
  };
}
