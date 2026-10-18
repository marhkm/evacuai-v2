import type { CampusSnapshot, EdgeStatus, NodeType, Point, Route } from '@evacuai/routing';

const localId = (id: string) => id.split('/').pop()!;

export function displayName(snap: CampusSnapshot, nodeId: string): string {
  const n = snap.nodes.find(x => x.id === nodeId);
  if (n?.name) return n.name;
  const room = n?.room_id ? snap.rooms.find(r => r.id === n.room_id) : undefined;
  if (room) return room.name;
  return localId(nodeId).replace(/_(G|\d+|Ground|Second|Third)$/, '').replace(/_/g, ' ');
}

export interface FloorShapes {
  rooms: { id: string; name: string; type: string; polygon: Point[]; status: 'open' | 'hazard' }[];
  nodes: { id: string; type: NodeType; x: number; y: number; name: string }[];
  edges: { id: string; a: Point; b: Point; status: EdgeStatus }[]; // same-floor edges only
}

export function toFloorShapes(snap: CampusSnapshot, buildingId: string, level: number): FloorShapes {
  const hazards = new Set(snap.hazardRoomIds);
  const onFloor = snap.nodes.filter(n => n.building === buildingId && n.level === level);
  const byId = new Map(onFloor.map(n => [n.id, n]));
  return {
    rooms: snap.rooms
      .filter(r => r.building === buildingId && r.level === level)
      .map(r => ({ id: r.id, name: r.name, type: r.type, polygon: r.polygon, status: hazards.has(r.id) ? 'hazard' : 'open' })),
    nodes: onFloor.map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y, name: displayName(snap, n.id) })),
    edges: snap.edges
      .filter(e => byId.has(e.from) && byId.has(e.to))
      .map(e => {
        const a = byId.get(e.from)!;
        const b = byId.get(e.to)!;
        return { id: e.id, a: [a.x, a.y], b: [b.x, b.y], status: e.status };
      }),
  };
}

export interface RouteOverlay {
  segments: { building: string; level: number; points: Point[] }[];
  transitions: { atNodeId: string; fromLevel: number; toLevel: number; direction: 'up' | 'down'; label: string }[];
}

const floorName = (snap: CampusSnapshot, building: string, level: number) =>
  snap.buildings.find(b => b.id === building)?.floors.find(f => f.level === level)?.name ?? `Level ${level}`;

export function routeOverlay(snap: CampusSnapshot, route: Route): RouteOverlay {
  const nodes = route.nodeIds.map(id => snap.nodes.find(n => n.id === id)!);
  const out: RouteOverlay = { segments: [], transitions: [] };
  nodes.forEach((n, i) => {
    const prev = nodes[i - 1];
    if (!prev || prev.level !== n.level || prev.building !== n.building) {
      if (prev) {
        const direction = n.level > prev.level ? 'up' : 'down';
        out.transitions.push({
          atNodeId: prev.id,
          fromLevel: prev.level,
          toLevel: n.level,
          direction,
          label: `${displayName(snap, prev.id)} ${direction === 'down' ? '↓' : '↑'} ${floorName(snap, n.building, n.level)}`,
        });
      }
      out.segments.push({ building: n.building, level: n.level, points: [] });
    }
    out.segments.at(-1)!.points.push([n.x, n.y]);
  });
  return out;
}

/** An exit that leads to another floor (a cross-over such as "To Old Building"): "Cross to the Old Building". */
function crossing(snap: CampusSnapshot, route: Route, id: string): string | null {
  const n = snap.nodes.find(x => x.id === id);
  const next = snap.nodes.find(x => x.id === route.nodeIds[route.nodeIds.indexOf(id) + 1]);
  if (n?.type !== 'exit' || !next || next.level === n.level) return null;
  return `Cross ${displayName(snap, id).replace(/^to\s+/i, 'to the ')}`;
}

export function routeSteps(snap: CampusSnapshot, route: Route): string[] {
  const origin = route.nodeIds[0];
  const name = displayName(snap, origin);
  if (route.destinationId === origin) return [`You are at ${name}. Stay here.`];
  const isRoom = snap.nodes.find(n => n.id === origin)?.type === 'room';
  const steps = [isRoom ? `Exit ${name}` : `Start at ${name}`];
  for (const t of routeOverlay(snap, route).transitions) {
    const nextId = route.nodeIds[route.nodeIds.indexOf(t.atNodeId) + 1];
    const next = snap.nodes.find(n => n.id === nextId)!;
    const cross = crossing(snap, route, t.atNodeId);
    const floor = floorName(snap, next.building, t.toLevel);
    steps.push(cross ? `${cross}, then go ${t.direction} to ${floor}` : `Take ${displayName(snap, t.atNodeId)} ${t.direction} to ${floor}`);
  }
  steps.push(`Go to ${displayName(snap, route.destinationId)}`);
  return steps;
}

// ── Poster-style floor drawing (Phase 2) ──

export interface PlanShapes {
  walls: Point[][];
  doors: string[]; // SVG path data: leaf line + swing arc
  stairs: Point[][];
  labels: { text: string; x: number; y: number }[];
  bounds: { minX: number; minY: number; w: number; h: number };
}

const centroid = (poly: Point[]): Point => {
  const ring = poly.length > 1 && poly[0][0] === poly.at(-1)![0] && poly[0][1] === poly.at(-1)![1] ? poly.slice(0, -1) : poly;
  return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
};

/** The floor as the evacuation poster draws it; room outlines stand in for walls on floors without a traced plan. */
export function toPlanShapes(snap: CampusSnapshot, buildingId: string, level: number): PlanShapes {
  const plan = snap.buildings.find(b => b.id === buildingId)?.floors.find(f => f.level === level)?.plan;
  const rooms = snap.rooms.filter(r => r.building === buildingId && r.level === level);
  const rad = (d: number) => (d * Math.PI) / 180;
  const shapes = plan
    ? {
      walls: plan.walls,
      doors: plan.doors.map(d => {
        const [hx, hy] = d.hinge;
        const a = [hx + d.r * Math.cos(rad(d.from)), hy + d.r * Math.sin(rad(d.from))];
        const b = [hx + d.r * Math.cos(rad(d.to)), hy + d.r * Math.sin(rad(d.to))];
        const sweep = ((d.to - d.from + 540) % 360) - 180 > 0 ? 1 : 0;
        return `M${hx} ${hy}L${a[0]} ${a[1]}A${d.r} ${d.r} 0 0 ${sweep} ${b[0]} ${b[1]}`;
      }),
      stairs: plan.stairs,
      labels: plan.labels,
    }
    : {
      walls: rooms.map(r => r.polygon),
      doors: [],
      stairs: [],
      labels: rooms.filter(r => r.type !== 'corridor').map(r => {
        const [x, y] = centroid(r.polygon);
        return { text: r.name, x, y };
      }),
    };
  const pts = [...shapes.walls.flat(), ...shapes.labels.map(l => [l.x, l.y] as Point)];
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const pad = 1.5;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return { ...shapes, bounds: { minX, minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY } };
}

/** Poster-style direction chevrons every `spacing` metres along a polyline (first one half a step in). */
export function routeChevrons(points: Point[], spacing = 1.5): { x: number; y: number; deg: number }[] {
  const out: { x: number; y: number; deg: number }[] = [];
  let next = spacing / 2;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const len = Math.hypot(bx - ax, by - ay);
    const deg = Math.round((Math.atan2(by - ay, bx - ax) * 180) / Math.PI * 10) / 10 + 0; // +0 turns -0 into 0
    while (next <= walked + len + 1e-9) {
      const t = (next - walked) / len;
      out.push({ x: Math.round((ax + (bx - ax) * t) * 100) / 100, y: Math.round((ay + (by - ay) * t) * 100) / 100, deg });
      next += spacing;
    }
    walked += len;
  }
  return out;
}

/** This floor's part of the route, cut at the building exit so it never runs off the drawing. */
export function floorRoutePoints(snap: CampusSnapshot, route: Route, buildingId: string, level: number): Point[] {
  const pts: Point[] = [];
  for (const id of route.nodeIds) {
    const n = snap.nodes.find(x => x.id === id);
    if (!n || n.building !== buildingId || n.level !== level) continue;
    pts.push([n.x, n.y]);
    if (n.type === 'exit') break;
  }
  return pts;
}

/** "Exit to <destination>" when the route leaves the building through an exit on this floor. */
export function exitBadge(snap: CampusSnapshot, route: Route, buildingId: string, level: number): string | null {
  const exit = route.nodeIds.slice(0, -1).find(id => {
    const n = snap.nodes.find(x => x.id === id);
    return n?.type === 'exit' && n.building === buildingId && n.level === level;
  });
  if (!exit) return null;
  return crossing(snap, route, exit) ?? `Exit to ${displayName(snap, route.destinationId)}`;
}
