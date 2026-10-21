import { toFloorShapes } from '@evacuai/campus-view';
import type { CampusSnapshot } from '@evacuai/routing';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { G, Line, Polygon, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme';

const TILT = 0.42; // vertical squash of each floor plane
const SHEAR = 0.55; // slant, so floors read as stacked slabs

/**
 * 2.5D view (spec §3.3): every floor of one building as a slanted layer, stacked by level. One SVG transform per
 * floor and no WebGL, so it works on every phone and shows multi-floor problems (blocked stairs, hazards) at a glance.
 */
export function StackedFloors({ snapshot, buildingId }: { snapshot: CampusSnapshot; buildingId: string }) {
  const layout = useMemo(() => {
    const building = snapshot.buildings.find(b => b.id === buildingId);
    if (!building) return null;
    const floors = [...building.floors].sort((a, b) => a.level - b.level).map(f => ({ ...f, shapes: toFloorShapes(snapshot, buildingId, f.level) }));
    const pts = floors.flatMap(f => f.shapes.rooms.flatMap(r => r.polygon));
    if (!pts.length) return null;
    const minX = Math.min(...pts.map(p => p[0]));
    const minY = Math.min(...pts.map(p => p[1]));
    const w = Math.max(...pts.map(p => p[0])) - minX;
    const d = Math.max(...pts.map(p => p[1])) - minY;
    const layerH = d * TILT + 4; // one floor's on-screen height plus a gap
    return { floors, minX, minY, w, d, layerH, label: Math.max(w, d) / 30 };
  }, [snapshot, buildingId]);
  const colors = useTheme(); // hooks before the early return
  if (!layout) return null;

  const { floors, minX, minY, w, d, layerH, label } = layout;
  const width = w + d * SHEAR + label * 8;
  const height = layerH * floors.length + 4;

  return (
    <View style={{ width: '100%', aspectRatio: width / height, maxHeight: 560 }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} accessibilityLabel="All floors stacked, ground floor at the bottom">
        {floors.map((f, i) => {
          const top = height - (i + 1) * layerH;
          // x' = x + SHEAR·y, y' = TILT·y, shifted so this floor's layer sits at `top`.
          const transform = `matrix(1 0 ${SHEAR} ${TILT} ${-minX - SHEAR * minY + label * 7} ${top - TILT * minY})`;
          const blocked = f.shapes.edges.filter(e => e.status !== 'open');
          const hazards = f.shapes.rooms.filter(r => r.status === 'hazard').length;
          return (
            <G key={f.level}>
              <G transform={transform}>
                {f.shapes.rooms.map(r => (
                  <Polygon key={r.id} points={r.polygon.map(p => p.join(',')).join(' ')}
                    fill={r.status === 'hazard' ? '#f5b7b1' : r.type === 'corridor' ? '#f7f7f7' : r.type === 'stairwell' ? '#dbe7f5' : '#e1ece4'}
                    stroke={r.status === 'hazard' ? colors.danger : '#8a968f'} strokeWidth={label / 8} />
                ))}
                {blocked.map(e => (
                  <Line key={e.id} x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]}
                    stroke={e.status === 'blocked' ? colors.danger : '#d68910'} strokeWidth={label / 2.5}
                    strokeDasharray={e.status === 'blocked' ? `${label / 2} ${label / 3}` : undefined} />
                ))}
              </G>
              <SvgText x={2} y={top + d * TILT * 0.6} fontSize={label * 1.1} fill={colors.text} fontWeight="700">{f.name}</SvgText>
              {blocked.length || hazards ? (
                <SvgText x={2} y={top + d * TILT * 0.6 + label * 1.4} fontSize={label * 0.9} fill={colors.danger}>
                  {[hazards ? `${hazards} hazard` : '', blocked.length ? `${blocked.length} path${blocked.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
