// One-off importer: student prototype floor SVGs (github.com/Lexageda/evacuai, read-only copy) → campus-data JSON.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EdgeType, Hazard, NodeType, Point } from '../../packages/routing/src/types';

export interface Rect { id: string; x: number; y: number; w: number; h: number }
export interface RawFloor {
  rooms: { id: string; name: string; type: string; polygon: Point[] }[];
  nodes: { id: string; type: NodeType; x: number; y: number; name?: string; room_id?: string; safe_for?: Hazard[] }[];
  edges: { from: string; to: string; type: EdgeType; distance_m?: number }[];
}

export function parseRects(svg: string): Rect[] {
  return [...svg.matchAll(/<rect\b[^>]*>/g)].map(([tag]) => {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    const attr = (name: string) => attrs[name] ?? '';
    return { id: attr('id'), x: +attr('x'), y: +attr('y'), w: +attr('width'), h: +attr('height') };
  });
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const kind = (id: string): NodeType =>
  id.startsWith('Stairs_') ? 'stairwell' : id.startsWith('Elevator_') ? 'elevator' : id.startsWith('Exit_') ? 'exit' : 'room';

export function buildFloor(rects: Rect[], opts: { level: number; scale: number; floodSafe: boolean; floorName?: string }): RawFloor {
  const k = opts.scale;
  const corridor = rects.find(r => r.id.startsWith('Corridor_'));
  if (!corridor) throw new Error('no Corridor_* rect');
  const cy = corridor.y + corridor.h / 2;
  const spaces = rects.filter(r => r !== corridor);
  const out: RawFloor = { rooms: [], nodes: [], edges: [] };

  for (const r of [corridor, ...spaces]) {
    const p: Point[] = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h], [r.x, r.y]];
    out.rooms.push({
      id: r.id,
      name: r.id.replace(/^Room_/, '').replace(/_(G|[0-9]+)$/, '').replace(/_/g, ' '),
      type: r === corridor ? 'corridor' : kind(r.id),
      polygon: p.map(([x, y]) => [r3(x * k), r3(y * k)]),
    });
  }

  const doorXs = [...new Set(spaces.filter(r => kind(r.id) !== 'stairwell').map(r => Math.round((r.x + r.w / 2) * 100) / 100))]
    .sort((a, b) => a - b);
  const hallIds = doorXs.map((_, i) => `C${opts.level}_${String(i + 1).padStart(2, '0')}`);
  doorXs.forEach((x, i) => out.nodes.push({
    id: hallIds[i], type: 'hallway', x: r3(x * k), y: r3(cy * k), room_id: corridor.id,
    ...(opts.floorName ? { name: `${opts.floorName} floor corridor` } : {}),
    ...(opts.floodSafe ? { safe_for: ['flood'] as Hazard[] } : {}),
  }));
  for (let i = 1; i < hallIds.length; i++) out.edges.push({ from: hallIds[i - 1], to: hallIds[i], type: 'corridor' });

  for (const r of spaces) {
    const t = kind(r.id);
    const cx = Math.round((r.x + r.w / 2) * 100) / 100;
    const below = r.y >= corridor.y + corridor.h;
    const y = t === 'stairwell' ? cy : below ? r.y : r.y + r.h;
    out.nodes.push({
      id: r.id, type: t, x: r3(cx * k), y: r3(y * k), room_id: r.id,
      ...(t === 'exit' ? { safe_for: ['earthquake', 'fire'] as Hazard[] } : {}),
    });
    const nearest = doorXs.reduce((best, x, i) => (Math.abs(x - cx) < Math.abs(doorXs[best] - cx) ? i : best), 0);
    out.edges.push({ from: r.id, to: hallIds[nearest], type: t === 'room' || t === 'exit' ? 'door' : 'corridor' });
  }
  return out;
}

const prefix = (id: string) => id.replace(/_(G|\d+)$/, '');

function main(argv: string[]) {
  const arg = (name: string) => argv[argv.indexOf(`--${name}`) + 1];
  const building = arg('building');
  const scale = Number(arg('scale'));
  const outDir = arg('out');
  const floors = argv.filter(a => a.includes('.svg:')).map(a => {
    const parts = a.split(':');
    const name = parts.pop()!;
    const level = parts.pop()!;
    const file = parts.join(':'); // keeps Windows drive letters
    return { file, level: Number(level), name };
  }).sort((a, b) => a.level - b.level);

  const built = new Map<number, RawFloor>();
  for (const f of floors) {
    built.set(f.level, buildFloor(parseRects(readFileSync(f.file, 'utf8')), { level: f.level, scale, floodSafe: f.level >= 2, floorName: f.name }));
  }

  for (const f of floors.slice(1)) {
    const upper = built.get(f.level)!;
    const lower = built.get(f.level - 1);
    if (!lower) continue;
    for (const n of upper.nodes.filter(n => n.type === 'stairwell' || n.type === 'elevator')) {
      const match = lower.nodes.find(m => m.type === n.type && prefix(m.id) === prefix(n.id));
      if (match) upper.edges.push({ from: n.id, to: `${building}/${f.level - 1}/${match.id}`, type: n.type === 'elevator' ? 'elevator' : 'stairs' });
    }
  }

  const ground = built.get(floors[0].level)!;
  const maxY = Math.max(...ground.rooms.flatMap(r => r.polygon.map(p => p[1])));
  // ponytail: AP position/distance are placeholders until the site survey; edit in floor-1.json
  ground.nodes.push({ id: 'AP_Field', type: 'assembly_point', x: ground.nodes[0].x, y: r3(maxY + 30), safe_for: ['earthquake', 'fire', 'flood'] });
  for (const exit of ground.nodes.filter(n => n.type === 'exit')) ground.edges.push({ from: exit.id, to: 'AP_Field', type: 'outdoor', distance_m: 30 });

  mkdirSync(outDir, { recursive: true });
  for (const f of floors) writeFileSync(join(outDir, `floor-${f.level}.json`), JSON.stringify(built.get(f.level), null, 2) + '\n');
  writeFileSync(join(outDir, 'building.json'), JSON.stringify({
    id: building, name: 'Basic Education Building', origin: null, rotation_deg: 0, footprint: [],
    floors: floors.map(f => ({ level: f.level, name: f.name, elevation_m: (f.level - 1) * 3.5, height_m: 3.5 })),
  }, null, 2) + '\n');
  writeFileSync(join(outDir, '..', 'campus.json'), JSON.stringify({
    name: 'UCLM', origin: null, buildings: [building],
    assembly_points: [{ id: 'AP_Field', node_id: `${building}/${floors[0].level}/AP_Field`, lat: null, lng: null, radius_m: 25 }],
  }, null, 2) + '\n');
  console.log(`wrote ${floors.length} floors to ${outDir}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
