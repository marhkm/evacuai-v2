import { findRoute } from './route';
import { HAZARDS, type CampusSnapshot } from './types';

export type IssueCode = 'duplicate_id' | 'duplicate_edge' | 'missing_ref' | 'open_polygon' | 'duplicate_qr' | 'stairs_same_level' | 'unreachable';
export interface Issue { code: IssueCode; message: string }

const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);

export function validate(snap: CampusSnapshot): Issue[] {
  const issues: Issue[] = [];
  const add = (code: IssueCode, message: string) => issues.push({ code, message });

  for (const id of new Set(dupes(snap.nodes.map(n => n.id)))) add('duplicate_id', `duplicate node id ${id}`);
  for (const id of new Set(dupes(snap.rooms.map(r => r.id)))) add('duplicate_id', `duplicate room id ${id}`);

  // Twin edges (same pair, either direction) let a route dodge an admin block on one of them.
  const pairs = snap.edges.map(e => [e.from, e.to].sort().join(' <-> '));
  for (const pair of new Set(dupes(pairs))) add('duplicate_edge', `more than one edge between ${pair}`);

  const nodes = new Map(snap.nodes.map(n => [n.id, n]));
  const rooms = new Set(snap.rooms.map(r => r.id));
  for (const e of snap.edges) {
    for (const end of [e.from, e.to]) if (!nodes.has(end)) add('missing_ref', `edge ${e.id} references missing node ${end}`);
  }
  for (const n of snap.nodes) {
    if (n.room_id && !rooms.has(n.room_id)) add('missing_ref', `node ${n.id} references missing room ${n.room_id}`);
  }
  for (const ap of snap.assemblyPoints) {
    if (!nodes.has(ap.node_id)) add('missing_ref', `assembly point ${ap.id} references missing node ${ap.node_id}`);
  }

  for (const r of snap.rooms) {
    const p = r.polygon;
    const closed = p.length >= 4 && p[0][0] === p.at(-1)![0] && p[0][1] === p.at(-1)![1];
    if (!closed) add('open_polygon', `room ${r.id} polygon is not closed`);
  }

  const qrs = snap.nodes.flatMap(n => (n.qr_id ? [n.qr_id] : []));
  for (const q of new Set(dupes(qrs))) add('duplicate_qr', `qr_id ${q} used by more than one node`);

  for (const e of snap.edges) {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    if ((e.type === 'stairs' || e.type === 'elevator') && a && b && a.level === b.level) {
      add('stairs_same_level', `${e.type} edge ${e.id} connects nodes on the same level`);
    }
  }

  if (!issues.some(i => i.code === 'missing_ref')) {
    const open: CampusSnapshot = {
      ...snap,
      edges: snap.edges.map(e => ({ ...e, status: 'open' as const })),
      hazardRoomIds: [],
    };
    for (const n of snap.nodes) {
      for (const h of HAZARDS) {
        const r = findRoute(open, n.id, h);
        if (!r.ok && r.reason === 'no_safe_route') add('unreachable', `${n.id} cannot reach a safe node for ${h}`);
      }
    }
  }
  return issues;
}
