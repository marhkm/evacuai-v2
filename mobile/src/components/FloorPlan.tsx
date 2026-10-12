import type { FloorShapes } from '@evacuai/campus-view';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

import { colors } from '@/components/ui';

const ROOM_FILL = { room: '#e8efe9', corridor: '#f7f7f7', stairwell: '#dbe7f5', exit: '#d4edda', elevator: '#ececec' } as Record<string, string>;
const NODE_COLOR = { exit: colors.primary, assembly_point: colors.primary, stairwell: '#2f6db5' } as Record<string, string>;

/** Pure SVG drawing of one floor (metres → viewBox). Status is shown by colour and dash pattern, never colour alone. */
export function FloorPlan({ shapes }: { shapes: FloorShapes }) {
  const box = useMemo(() => {
    const pts = [...shapes.rooms.flatMap(r => r.polygon), ...shapes.nodes.map(n => [n.x, n.y] as const)];
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const pad = 2;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    return { minX, minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY };
  }, [shapes]);
  if (!Number.isFinite(box.w)) return null;
  const label = Math.max(box.w, box.h) / 45; // text size in metres

  return (
    <View style={{ width: '100%', aspectRatio: box.w / box.h, maxHeight: 520 }}>
      <Svg width="100%" height="100%" viewBox={`${box.minX} ${box.minY} ${box.w} ${box.h}`}>
        {shapes.rooms.map(r => (
          <Polygon
            key={r.id}
            accessibilityLabel={`Room ${r.name}${r.status === 'hazard' ? ', hazard reported' : ''}`}
            points={r.polygon.map(p => p.join(',')).join(' ')}
            fill={r.status === 'hazard' ? '#f8d7da' : ROOM_FILL[r.type] ?? ROOM_FILL.room}
            stroke={r.status === 'hazard' ? colors.danger : '#7d8a83'}
            strokeWidth={label / 6}
          />
        ))}
        {shapes.edges.map(e => (
          <Line
            key={e.id}
            x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]}
            stroke={e.status === 'blocked' ? colors.danger : e.status === 'congested' ? '#d68910' : '#9aa5a0'}
            strokeWidth={e.status === 'open' ? label / 5 : label / 2.5}
            strokeDasharray={e.status === 'blocked' ? `${label / 2} ${label / 3}` : undefined}
          />
        ))}
        {shapes.nodes.filter(n => NODE_COLOR[n.type]).map(n => (
          <Circle key={n.id} cx={n.x} cy={n.y} r={label / 1.5} fill={NODE_COLOR[n.type]} />
        ))}
        {shapes.rooms.filter(r => r.type !== 'corridor').map(r => {
          const cx = r.polygon.reduce((s, p) => s + p[0], 0) / r.polygon.length;
          const cy = r.polygon.reduce((s, p) => s + p[1], 0) / r.polygon.length;
          return (
            <SvgText key={`${r.id}-t`} x={cx} y={cy} fontSize={label} fill={colors.text} textAnchor="middle">{r.name}</SvgText>
          );
        })}
      </Svg>
    </View>
  );
}
