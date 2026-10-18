import { routeChevrons, toFloorShapes, toPlanShapes } from '@evacuai/campus-view';
import type { CampusSnapshot, Point } from '@evacuai/routing';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Polyline, Text as SvgText } from 'react-native-svg';

import { colors } from '@/components/ui';

/** Poster palette: the same look as UCLM's printed evacuation plans. */
export const PLAN = {
  sheet: '#FFFFFF',
  wall: '#1B1F24',
  door: '#5A6470',
  stairs: '#C4651F',
  label: '#1F3FBF',
  route: '#D7263D',
  you: '#2BA84A',
  hazard: '#F8D7DA',
  blocked: '#2B2F36',
  congested: '#F2A900',
};

type Props = {
  snapshot: CampusSnapshot;
  building: string;
  level: number;
  route?: Point[]; // this floor's part of the route (see floorRoutePoints)
  you?: Point;
  badge?: string | null; // e.g. "Exit to Off-campus assembly area"
};

const pts = (p: Point[]) => p.map(q => q.join(',')).join(' ');

/** One floor drawn like the evacuation poster: walls, door swings, stairs, blue labels, red escape chevrons. */
export function FloorPlan({ snapshot, building, level, route, you, badge }: Props) {
  const [legend, setLegend] = useState(false);
  const plan = useMemo(() => toPlanShapes(snapshot, building, level), [snapshot, building, level]);
  const shapes = useMemo(() => toFloorShapes(snapshot, building, level), [snapshot, building, level]);
  const chevrons = useMemo(() => (route && route.length > 1 ? routeChevrons(route) : []), [route]);
  const walls = useMemo(() => plan.walls.map(w => `M${w.map(p => p.join(' ')).join('L')}`).join(''), [plan]);
  const { minX, minY, w, h } = plan.bounds;
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  const u = Math.max(w, h) / 60; // one drawing unit in metres (text, strokes)

  return (
    <View style={styles.wrap}>
      {badge ? <Text style={styles.badge} accessibilityRole="text">{badge}</Text> : null}
      <View style={{ width: '100%', aspectRatio: w / h, maxHeight: 560, backgroundColor: PLAN.sheet }}>
        <Svg width="100%" height="100%" viewBox={`${minX} ${minY} ${w} ${h}`}>
          {shapes.rooms.map(r => (
            <Polygon
              key={r.id}
              accessibilityLabel={`Room ${r.name}${r.status === 'hazard' ? ', hazard reported' : ''}`}
              points={pts(r.polygon)}
              fill={r.status === 'hazard' ? PLAN.hazard : 'transparent'}
            />
          ))}
          {plan.stairs.map((s, i) => (
            <Polygon key={`s${i}`} points={pts(s)} fill="#F6DFC9" stroke={PLAN.stairs} strokeWidth={u / 6} strokeDasharray={`${u / 3} ${u / 5}`} />
          ))}
          <Path d={walls} stroke={PLAN.wall} strokeWidth={Math.max(0.12, u / 5)} strokeLinecap="square" fill="none" />
          {plan.doors.map((d, i) => <Path key={`d${i}`} d={d} stroke={PLAN.door} strokeWidth={u / 8} fill="none" />)}
          {shapes.edges.filter(e => e.status !== 'open').map(e => {
            const blocked = e.status === 'blocked';
            const mx = (e.a[0] + e.b[0]) / 2;
            const my = (e.a[1] + e.b[1]) / 2;
            return (
              <G key={e.id}>
                <Line accessibilityLabel={blocked ? 'Blocked path' : 'Congested path'} x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]}
                  stroke={blocked ? PLAN.blocked : PLAN.congested} strokeWidth={u * 0.9}
                  strokeDasharray={blocked ? `${u / 2.5} ${u / 4}` : undefined} />
                {blocked ? (
                  <SvgText x={mx} y={my + u / 2} fontSize={u * 1.6} fontWeight="bold" fill={PLAN.blocked} textAnchor="middle">✕</SvgText>
                ) : null}
              </G>
            );
          })}
          {chevrons.length ? (
            <Polyline accessibilityLabel="Your evacuation route" points={pts(route!)} fill="none" stroke={PLAN.route} strokeWidth={u / 5} strokeOpacity={0.55} />
          ) : null}
          {chevrons.map((c, i) => (
            <Path
              key={`c${i}`}
              accessibilityLabel="Route direction"
              d={`M${-u * 0.55} ${-u * 0.6}L${u * 0.55} 0L${-u * 0.55} ${u * 0.6}L${-u * 0.2} 0Z`}
              fill={PLAN.route}
              transform={`translate(${c.x} ${c.y}) rotate(${c.deg})`}
            />
          ))}
          {plan.labels.map((l, i) => (
            <SvgText key={`l${i}`} accessibilityLabel={`Map label ${l.text.toUpperCase()}`} x={l.x} y={l.y} fontSize={u * 1.3} fontFamily="Arial, Helvetica, sans-serif" fontWeight="bold" fill={PLAN.label} textAnchor="middle">
              {l.text.toUpperCase()}
            </SvgText>
          ))}
          {you ? (
            <G accessibilityLabel="You are here" transform={`translate(${you[0]} ${you[1]})`}>
              <Circle cx={0} cy={-u * 1.5} r={u * 0.5} fill={PLAN.you} />
              <Path d={`M${-u * 0.55} ${-u * 0.9}H${u * 0.55}L${u * 0.35} ${u * 0.4}H${-u * 0.35}Z`} fill={PLAN.you} />
              <Circle cx={0} cy={0} r={u * 1.9} fill="none" stroke={PLAN.you} strokeWidth={u / 6} />
            </G>
          ) : null}
        </Svg>
      </View>
      <Pressable onPress={() => setLegend(v => !v)} accessibilityRole="button" accessibilityLabel="Map legend" style={styles.legendChip}>
        <Text style={styles.legendTitle}>{legend ? 'Hide legend' : 'Legend'}</Text>
      </Pressable>
      {legend ? (
        <View style={styles.legend}>
          <Text style={[styles.legendRow, { color: PLAN.route }]}>➤ Fire escape route</Text>
          <Text style={[styles.legendRow, { color: PLAN.you }]}>● Your location</Text>
          <Text style={[styles.legendRow, { color: PLAN.blocked }]}>✕ Blocked path</Text>
          <Text style={[styles.legendRow, { color: '#9a6b00' }]}>━ Congested path</Text>
          <Text style={[styles.legendRow, { color: PLAN.stairs }]}>▤ Stairs</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  badge: { alignSelf: 'flex-start', backgroundColor: PLAN.you, color: '#fff', fontWeight: '800', fontSize: 15, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  legendChip: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.muted, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  legendTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  legend: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: '#f4f6fa' },
  legendRow: { fontSize: 15, fontWeight: '700' },
});
