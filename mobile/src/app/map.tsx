import { toFloorShapes } from '@evacuai/campus-view';
import type { CampusSnapshot } from '@evacuai/routing';
import { Redirect } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FloorPlan } from '@/components/FloorPlan';
import { Message, Screen, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { loadSnapshot } from '@/lib/campus';

export default function MapScreen() {
  const { state, token } = useAuth();
  const [snapshot, setSnapshot] = useState<CampusSnapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    if (state.status !== 'signedIn') return;
    loadSnapshot(token)
      .then(r => { setSnapshot(r.snapshot); setOffline(r.offline); })
      .catch(e => setError((e as Error).message));
  }, [state.status, token]);

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
      {building ? (
        <Tabs items={building.floors.map(f => ({ key: String(f.level), label: f.name }))} active={String(floor?.level)} onSelect={l => setLevel(Number(l))} />
      ) : null}
      {shapes ? <FloorPlan shapes={shapes} /> : null}
      {shapes ? (
        <View style={styles.legend}>
          <Text style={styles.legendText}>● Exit / assembly point (green) · ● Stairs (blue)</Text>
          <Text style={[styles.legendText, blocked ? styles.blocked : null]}>
            {blocked === 0 ? 'No blocked paths on this floor' : `${blocked} blocked path${blocked === 1 ? '' : 's'} on this floor`}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

function Tabs({ items, active, onSelect }: { items: { key: string; label: string }[]; active?: string; onSelect: (key: string) => void }) {
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

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.primary, minHeight: 44, justifyContent: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  legend: { gap: 4 },
  legendText: { fontSize: 14, color: colors.muted },
  blocked: { color: colors.danger, fontWeight: '700' },
});
