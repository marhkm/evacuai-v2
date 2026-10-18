export type Hazard = 'earthquake' | 'fire' | 'flood';
export const HAZARDS: readonly Hazard[] = ['earthquake', 'fire', 'flood'];

export type Point = [number, number];
export type EdgeStatus = 'open' | 'blocked' | 'congested';
export type NodeType = 'room' | 'hallway' | 'stairwell' | 'exit' | 'assembly_point' | 'elevator';
export type EdgeType = 'corridor' | 'stairs' | 'ramp' | 'door' | 'outdoor' | 'elevator';

/** Drawing of one floor traced from the official evacuation poster, in metres (same axes as rooms and nodes). */
export interface FloorPlan {
  walls: Point[][];
  doors: { hinge: Point; r: number; from: number; to: number }[]; // swing arc, degrees
  stairs: Point[][];
  labels: { text: string; x: number; y: number }[];
  arrows: { x: number; y: number; deg: number }[]; // the poster's fire-escape arrows (reference, not drawn)
}

export interface Floor { level: number; name: string; elevation_m: number; height_m: number; plan?: FloorPlan }

export interface Building {
  id: string;
  name: string;
  origin: { lat: number; lng: number } | null;
  rotation_deg: number;
  footprint: Point[];
  floors: Floor[];
}

export interface Room { id: string; building: string; level: number; name: string; type: string; polygon: Point[] }

export interface CampusNode {
  id: string;
  building: string;
  level: number;
  type: NodeType;
  x: number;
  y: number;
  name?: string;
  room_id?: string;
  safe_for: Hazard[];
  qr_id?: string;
  capacity?: number;
  occupancy?: number;
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  distance_m: number;
  bidirectional: boolean;
  flags: string[];
  status: EdgeStatus;
}

export interface AssemblyPoint { id: string; node_id: string; lat: number | null; lng: number | null; radius_m: number }

// JSON-safe: never put Infinity here (JSON.stringify turns it into null). Impassable flags go in blockFlags.
export interface RuleWeights {
  congested: number;
  fullAssemblyPenalty_m: number;
  flags: Record<Hazard, Record<string, number>>; // finite cost multipliers
  blockFlags: Record<Hazard, string[]>; // flags that make an edge impassable for that hazard
}

export const DEFAULT_WEIGHTS: RuleWeights = {
  congested: 2.5,
  fullAssemblyPenalty_m: 100,
  flags: { earthquake: { glass: 3 }, fire: {}, flood: {} },
  blockFlags: { earthquake: [], fire: ['smoke'], flood: ['flood_prone'] },
};

export interface CampusSnapshot {
  name: string;
  buildings: Building[];
  rooms: Room[];
  nodes: CampusNode[];
  edges: Edge[];
  assemblyPoints: AssemblyPoint[];
  hazardRoomIds: string[];
  weights: RuleWeights;
}

export interface Route { nodeIds: string[]; distance_m: number; cost: number; destinationId: string }

export type RouteResult =
  | { ok: true; route: Route }
  | { ok: false; reason: 'unknown_origin' | 'no_safe_route' };
