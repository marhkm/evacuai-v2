import type { LiveState } from '@evacuai/campus-3d';
import { toPlanShapes } from '@evacuai/campus-view';
import type { CampusSnapshot, Edge } from '@evacuai/routing';
import { useId } from 'react';

// Poster colours: the plan is drawn as the white evacuation sheet, also on the dark Command Center.
const PLAN = { sheet: '#FFFFFF', wall: '#1B1F24', door: '#5A6470', stairs: '#C4651F', label: '#1F3FBF', hazard: '#F8D7DA', danger: '#D7263D', blocked: '#2B2F36', congested: '#F2A900', checkin: '#0E8A61' };

type Props = {
  snap: CampusSnapshot;
  building: string;
  level: number;
  live?: LiveState;
  /** When given, every path on the floor can be clicked (the Paths screen). */
  onEdge?: (edge: Edge) => void;
};

const pts = (p: [number, number][]) => p.map(([x, y]) => `${x},${y}`).join(' ');
const centre = (p: [number, number][]) => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];

/** The floor as the evacuation poster draws it, with live path status, hazard rooms, people counts and pins. */
export function PlanView({ snap, building, level, live = {}, onEdge }: Props) {
  const hatch = useId();
  const shapes = toPlanShapes(snap, building, level);
  const { minX, minY, w, h } = shapes.bounds;
  const node = new Map(snap.nodes.filter(n => n.building === building && n.level === level).map(n => [n.id, n]));
  const rooms = snap.rooms.filter(r => r.building === building && r.level === level);
  const hazards = new Set(live.hazardRoomIds ?? snap.hazardRoomIds);
  const status = (e: Edge) => (live.edges ? (live.edges[e.id] ?? 'open') : e.status);
  const edges = snap.edges.filter(e => node.has(e.from) && node.has(e.to) && e.type !== 'elevator');
  const unit = Math.max(w, h) / 100; // stroke and text size relative to the floor

  return (
    <svg className="plan" viewBox={`${minX} ${minY} ${w} ${h}`} role="img" aria-label={`Floor plan, ${building} level ${level}`}>
      <defs>
        <pattern id={hatch} width={unit * 1.2} height={unit * 1.2} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={unit * 1.2} stroke={PLAN.stairs} strokeWidth={unit * 0.3} />
        </pattern>
      </defs>
      <rect x={minX} y={minY} width={w} height={h} fill={PLAN.sheet} />
      {rooms.filter(r => hazards.has(r.id)).map(r => (
        <polygon key={r.id} points={pts(r.polygon)} fill={PLAN.hazard} stroke={PLAN.danger} strokeWidth={unit * 0.3} aria-label={`Hazard: ${r.name}`} />
      ))}
      {shapes.stairs.map((s, i) => <polygon key={i} points={pts(s)} fill={`url(#${hatch})`} stroke={PLAN.stairs} strokeWidth={unit * 0.15} />)}
      {shapes.walls.map((wl, i) => <polyline key={i} points={pts(wl)} fill="none" stroke={PLAN.wall} strokeWidth={unit * 0.25} strokeLinejoin="round" />)}
      {shapes.doors.map((d, i) => <path key={i} d={d} fill="none" stroke={PLAN.door} strokeWidth={unit * 0.12} />)}
      {shapes.labels.map((l, i) => (
        <text key={i} x={l.x} y={l.y} fontSize={unit * 1.6} fill={PLAN.label} textAnchor="middle" dominantBaseline="middle" fontWeight={600}>{l.text}</text>
      ))}
      {edges.map(e => {
        const a = node.get(e.from)!;
        const b = node.get(e.to)!;
        const s = status(e);
        if (s === 'open' && !onEdge) return null;
        const label = s === 'blocked' ? 'Blocked path' : s === 'congested' ? 'Congested path' : 'Open path';
        const short = (id: string) => node.get(id)?.name ?? id.split('/').pop();
        const color = s === 'blocked' ? PLAN.blocked : s === 'congested' ? PLAN.congested : 'transparent';
        return (
          <g key={e.id} className={onEdge ? 'edge clickable' : 'edge'} onClick={onEdge && (() => onEdge(e))} role={onEdge ? 'button' : undefined}
            tabIndex={onEdge ? 0 : undefined} onKeyDown={onEdge && (k => (k.key === 'Enter' || k.key === ' ') && onEdge(e))} aria-label={onEdge ? `${label}, ${short(e.from)} to ${short(e.to)}` : label}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={unit * 0.9} strokeLinecap="round"
              strokeDasharray={s === 'blocked' ? `${unit} ${unit * 0.6}` : undefined} />
            {onEdge && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={unit * 2.5} />}
            {s === 'blocked' && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} fontSize={unit * 2.2} fill={PLAN.danger} textAnchor="middle" dominantBaseline="middle" fontWeight={700}>✕</text>}
          </g>
        );
      })}
      {rooms.map(r => {
        const n = live.roomCounts?.[r.id];
        if (!n) return null;
        const [x, y] = centre(r.polygon);
        return (
          <g key={r.id} className="count">
            <rect x={x - unit * 4} y={y + unit * 1.2} width={unit * 8} height={unit * 2.4} rx={unit * 1.2} fill={PLAN.danger} />
            <text x={x} y={y + unit * 2.45} fontSize={unit * 1.5} fill="#fff" textAnchor="middle" dominantBaseline="middle" fontWeight={700}>{n === 1 ? '1 person' : `${n} people`}</text>
          </g>
        );
      })}
      {(live.pins ?? []).filter(p => node.has(p.nodeId)).map(p => {
        const n = node.get(p.nodeId)!;
        return (
          <circle key={p.id} className={p.kind === 'sos' ? 'pin sos' : 'pin'} cx={n.x} cy={n.y} r={unit * 1.2}
            fill={p.kind === 'sos' ? PLAN.danger : PLAN.checkin} stroke="#fff" strokeWidth={unit * 0.3}>
            <title>{p.label}</title>
          </circle>
        );
      })}
    </svg>
  );
}
