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

export function routeSteps(snap: CampusSnapshot, route: Route): string[] {
  const origin = route.nodeIds[0];
  const name = displayName(snap, origin);
  if (route.destinationId === origin) return [`You are at ${name}. Stay here.`];
  const isRoom = snap.nodes.find(n => n.id === origin)?.type === 'room';
  const steps = [isRoom ? `Exit ${name}` : `Start at ${name}`];
  for (const t of routeOverlay(snap, route).transitions) {
    const nextId = route.nodeIds[route.nodeIds.indexOf(t.atNodeId) + 1];
    const next = snap.nodes.find(n => n.id === nextId)!;
    steps.push(`Take ${displayName(snap, t.atNodeId)} ${t.direction} to ${floorName(snap, next.building, t.toLevel)}`);
  }
  steps.push(`Go to ${displayName(snap, route.destinationId)}`);
  return steps;
}
