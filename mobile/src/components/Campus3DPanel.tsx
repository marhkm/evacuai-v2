import type { Preset } from '@evacuai/campus-3d/src/views';
import type { CampusSnapshot, Route } from '@evacuai/routing';
import { Host, Slider } from '@expo/ui';
import { router, useIsFocused } from 'expo-router';
import { Suspense, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Campus3DView } from '@/components/Campus3DLazy';
import { Chips, Section } from '@/components/Chips';
import { RoomSheet, type PickedRoom } from '@/components/RoomSheet';
import { Button } from '@/components/ui';
import { useAlerts } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';
import { quality3d } from '@/lib/can3d';
import { nativeLabel } from '@/lib/nativeLabel';
import { updateWhereabouts } from '@/lib/whereabouts';
import { makeStyles, useTheme } from '@/theme';

// One number per snapshot object (a new one arrives only when the campus data is refetched).
const versions = new WeakMap<CampusSnapshot, number>();
let nextVersion = 0;
const versionOf = (snap: CampusSnapshot) => versions.get(snap) ?? (versions.set(snap, ++nextVersion), nextVersion);

export type View3DState = { level: number | null; view: Preset; explode: number };

const VIEWS: { key: Preset; label: string }[] = [{ key: '3d', label: '3D' }, { key: 'top', label: 'Top' }, { key: 'front', label: 'Front' }, { key: 'route', label: 'Follow route' }];

/**
 * One building in 3D with native controls (floors, view, explode) and a native bottom sheet for a tapped room.
 * The 3D canvas itself is the Campus3DView DOM component.
 */
export function Campus3DPanel({ snapshot, building, route, height, initial, onFullScreen }: {
  snapshot: CampusSnapshot; building: string; route?: Route | null; height?: number; initial?: Partial<View3DState>;
  onFullScreen?: (current: View3DState) => void;
}) {
  const s = useStyles();
  const c = useTheme();
  const { token } = useAuth();
  const { active } = useAlerts();
  const [level, setLevel] = useState<number | null>(initial?.level ?? null);
  const [view, setView] = useState<Preset>(initial?.view ?? '3d');
  const [explode, setExplode] = useState(initial?.explode ?? 0);
  const [resetKey, setResetKey] = useState(0);
  // Only the screen in front draws: under the full-screen modal the map's own web view is let go.
  const focused = useIsFocused();
  const routeHere = !!route?.nodeIds.some(id => id.startsWith(`${building}/`));
  const [room, setRoom] = useState<PickedRoom | null>(null);
  const [quality] = useState(quality3d);
  const floors = snapshot.buildings.find(b => b.id === building)?.floors ?? [];
  // Props reach the web view as fresh JSON on every render; this number changes only with new campus data, and the
  // web view rebuilds its scene only when it does.
  const version = versionOf(snapshot);

  function routeFrom(r: PickedRoom) {
    const info = snapshot.rooms.find(x => x.id === r.roomId);
    if (info) updateWhereabouts({ source: 'manual', roomId: info.id, building: info.building, floor: info.level }, token, !!active[0]);
    setRoom(null);
    router.push('/route');
  }

  return (
    <View style={s.wrap}>
      <View style={[s.view, { height: height ?? 420 }]}>
        {focused ? (
          <Suspense fallback={<ActivityIndicator color={c.safe} />}>
            <Campus3DView
              snapshot={snapshot} version={version} building={building} level={level} view={view} explode={explode} route={route ?? null}
              quality={quality} resetKey={resetKey}
              onPick={async info => { if (info.roomId) setRoom(info as PickedRoom); }}
              dom={{ style: { flex: 1 }, scrollEnabled: false }}
            />
          </Suspense>
        ) : null}
      </View>
      <Section label="Floor">
        <Chips
          items={[{ key: 'all', label: 'Whole building', a11yLabel: 'Whole building' }, ...floors.map(f => ({ key: String(f.level), label: f.name }))]}
          active={level === null ? 'all' : String(level)} onSelect={k => setLevel(k === 'all' ? null : Number(k))} />
      </Section>
      <Section label="View">
        <Chips items={VIEWS.filter(v => v.key !== 'route' || routeHere)} active={view} onSelect={k => setView(k as Preset)} />
      </Section>
      <Section label="Explode floors">
        <Host matchContents={{ vertical: true }} style={s.slider}>
          <Slider value={explode} onValueChange={setExplode} min={0} max={3} step={0.1} modifiers={nativeLabel('Explode floors')} />
        </Host>
      </Section>
      <View style={s.row}>
        <View style={s.grow}><Button label="Reset" variant="secondary" onPress={() => { setLevel(null); setView('3d'); setExplode(0); setResetKey(k => k + 1); }} /></View>
        {onFullScreen ? <View style={s.grow}><Button label="Full screen" variant="secondary" onPress={() => onFullScreen({ level, view, explode })} /></View> : null}
      </View>
      <RoomSheet room={room} onClose={() => setRoom(null)} onRouteFrom={routeFrom} />
    </View>
  );
}

const useStyles = makeStyles(c => ({
  wrap: { gap: 12 },
  view: { borderRadius: 14, overflow: 'hidden', justifyContent: 'center', backgroundColor: c.surface2 },
  slider: { width: '100%' },
  row: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1 },
}));
