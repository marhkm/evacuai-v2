import { toFloorShapes } from '@evacuai/campus-view';
import { Redirect } from 'expo-router';
import { Suspense, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Campus3DView } from '@/components/Campus3DLazy';
import { FloorPlan } from '@/components/FloorPlan';
import { StackedFloors } from '@/components/StackedFloors';
import { Message, Screen } from '@/components/ui';
import { fonts, makeStyles, useTheme } from '@/theme';
import { useAlerts } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';
import { can3d } from '@/lib/can3d';
import { useCampus } from '@/lib/useCampus';

type Mode = 'plan' | 'stacked' | '3d';

export default function MapScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const { state } = useAuth();
  const { active } = useAlerts();
  const { snapshot, offline, error } = useCampus(); // live: refetches when officers block or reopen paths
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [has3d] = useState(can3d);
  // A choice only lasts for the alert it was made under: a new alert always opens the plain floor plan (spec §3.4).
  const alertId = active[0]?.id ?? null;
  const [choice, setChoice] = useState<{ mode: Mode; alertId: number | null }>({ mode: 'plan', alertId: null });
  const mode: Mode = choice.alertId === alertId ? choice.mode : 'plan';

  const building = snapshot?.buildings.find(b => b.id === buildingId) ?? snapshot?.buildings[0];
  const floor = building?.floors.find(f => f.level === level) ?? building?.floors[0];
  const shapes = useMemo(
    () => (snapshot && building && floor ? toFloorShapes(snapshot, building.id, floor.level) : null),
    [snapshot, building, floor],
  );

  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const blocked = shapes?.edges.filter(e => e.status === 'blocked').length ?? 0;

  return (
    <Screen title="Campus map">
      <Message text={error} />
      <Message text={offline ? 'Offline: showing the last downloaded map.' : null} kind="info" />
      {snapshot && snapshot.buildings.length > 1 ? (
        <Tabs items={snapshot.buildings.map(b => ({ key: b.id, label: b.name }))} active={building?.id} onSelect={id => { setBuildingId(id); setLevel(null); }} />
      ) : null}
      <Tabs
        items={[{ key: 'plan', label: 'Floor plan' }, { key: 'stacked', label: 'All floors' }, ...(has3d ? [{ key: '3d', label: '3D' }] : [])]}
        active={mode} onSelect={m => setChoice({ mode: m as Mode, alertId })} />
      {mode === 'plan' && building ? (
        <Tabs items={building.floors.map(f => ({ key: String(f.level), label: f.name }))} active={String(floor?.level)} onSelect={l => setLevel(Number(l))} />
      ) : null}
      {mode === 'stacked' && snapshot && building ? <StackedFloors snapshot={snapshot} buildingId={building.id} /> : null}
      {mode === '3d' && snapshot ? (
        <View style={styles.view3d}>
          <Suspense fallback={<ActivityIndicator color={colors.primary} />}>
            <Campus3DView snapshot={snapshot} dom={{ style: { flex: 1 }, scrollEnabled: false }} />
          </Suspense>
        </View>
      ) : null}
      {mode === 'plan' && snapshot && building && floor ? <FloorPlan snapshot={snapshot} building={building.id} level={floor.level} /> : null}
      {mode === 'plan' && shapes ? (
        <View style={styles.legend}>
          <Text style={[styles.legendText, blocked ? styles.blocked : null]}>
            {blocked === 0 ? 'No blocked paths on this floor' : `${blocked} blocked path${blocked === 1 ? '' : 's'} on this floor`}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

function Tabs({ items, active, onSelect }: { items: { key: string; label: string }[]; active?: string; onSelect: (key: string) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {items.map(i => (
        <Pressable
          key={i.key}
          accessibilityRole="button"
          accessibilityLabel={i.label}
          accessibilityState={{ selected: i.key === active }}
          onPress={() => onSelect(i.key)}
          style={[styles.tab, i.key === active && styles.tabActive]}
        >
          <Text style={[styles.tabText, i.key === active && styles.tabTextActive]}>{i.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles(c => ({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: c.infoText, minHeight: 44, justifyContent: 'center' },
  tabActive: { backgroundColor: c.infoFill, borderColor: c.infoFill },
  tabText: { fontFamily: fonts.bodySemi, color: c.infoText, fontSize: 15 },
  tabTextActive: { color: c.onColor },
  legend: { gap: 4 },
  legendText: { fontFamily: fonts.body, fontSize: 14, color: c.muted },
  blocked: { color: c.danger, fontFamily: fonts.bodyBold },
  view3d: { height: 460, borderRadius: 12, overflow: 'hidden', justifyContent: 'center' },
}));
