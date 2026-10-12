import { DEFAULT_WEIGHTS, type CampusNode, type CampusSnapshot, type Edge, type Hazard, type RouteResult, type RuleWeights } from './types';

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// Snapshots arrive as JSON from the API: tolerate missing tables, fail closed on non-numeric weights.
export function edgeCost(edge: Edge, hazard: Hazard, w: RuleWeights): number {
  if (edge.status === 'blocked' || edge.type === 'elevator') return Infinity;
  const flags = edge.flags ?? [];
  if ((w.blockFlags?.[hazard] ?? []).some(f => flags.includes(f))) return Infinity;
  let factor = edge.status === 'congested' ? num(w.congested, DEFAULT_WEIGHTS.congested) : 1;
  const table: Record<string, unknown> = w.flags?.[hazard] ?? {};
  for (const flag of flags) {
    if (!(flag in table)) continue;
    const f = table[flag];
    if (typeof f !== 'number' || !Number.isFinite(f)) return Infinity;
    factor *= f;
  }
  return edge.distance_m * factor;
}

const penalty = (n: CampusNode, w: RuleWeights) =>
  n.type === 'assembly_point' && typeof n.capacity === 'number' && typeof n.occupancy === 'number'
    && n.occupancy >= n.capacity ? num(w.fullAssemblyPenalty_m, DEFAULT_WEIGHTS.fullAssemblyPenalty_m) : 0;

export function findRoute(snap: CampusSnapshot, originId: string, hazard: Hazard): RouteResult {
  const nodes = new Map(snap.nodes.map(n => [n.id, n]));
  if (!nodes.has(originId)) return { ok: false, reason: 'unknown_origin' };

  const hazardRooms = new Set(snap.hazardRoomIds ?? []);
  const inHazard = (id: string) => {
    const room = nodes.get(id)!.room_id;
    return room !== undefined && hazardRooms.has(room);
  };
  // Occupants of a hazard room (the origin's room) may move through it to get out; nobody else may enter.
  const originRoom = nodes.get(originId)!.room_id;
  const passable = (id: string) => id === originId || !inHazard(id) || nodes.get(id)!.room_id === originRoom;

  const adj = new Map<string, { to: string; cost: number; edge: Edge }[]>();
  const link = (from: string, to: string, cost: number, edge: Edge) => {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push({ to, cost, edge });
  };
  for (const e of snap.edges) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
    const c = edgeCost(e, hazard, snap.weights);
    if (c === Infinity) continue;
    link(e.from, e.to, c, e);
    if (e.bidirectional) link(e.to, e.from, c, e);
  }

  // ponytail: O(n²) queue, fine for <5k nodes; swap for binary heap if campus grows
  const cost = new Map<string, number>([[originId, 0]]);
  const dist = new Map<string, number>([[originId, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  for (;;) {
    let cur: string | undefined;
    for (const [id, c] of cost) if (!done.has(id) && (cur === undefined || c < cost.get(cur)!)) cur = id;
    if (cur === undefined) break;
    done.add(cur);
    for (const { to, cost: c, edge } of adj.get(cur) ?? []) {
      if (done.has(to) || !passable(to)) continue;
      const next = cost.get(cur)! + c;
      if (next < (cost.get(to) ?? Infinity)) {
        cost.set(to, next);
        dist.set(to, dist.get(cur)! + edge.distance_m);
        prev.set(to, cur);
      }
    }
  }

  let best: { id: string; score: number; dist: number } | undefined;
  for (const id of done) {
    const n = nodes.get(id)!;
    if (!(n.safe_for ?? []).includes(hazard) || inHazard(id)) continue; // never end inside a hazard room
    const cand = { id, score: cost.get(id)! + penalty(n, snap.weights), dist: dist.get(id)! };
    if (!best || cand.score < best.score
      || (cand.score === best.score && (cand.dist < best.dist || (cand.dist === best.dist && cand.id < best.id)))) best = cand;
  }
  if (!best) return { ok: false, reason: 'no_safe_route' };

  const nodeIds = [best.id];
  while (nodeIds[0] !== originId) nodeIds.unshift(prev.get(nodeIds[0])!);
  return { ok: true, route: { nodeIds, distance_m: best.dist, cost: best.score, destinationId: best.id } };
}
