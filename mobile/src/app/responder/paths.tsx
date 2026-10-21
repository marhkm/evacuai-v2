import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chips, Section } from '@/components/Chips';
import { FloorPlan } from '@/components/FloorPlan';
import { Message, Screen, colors } from '@/components/ui';
import { useOfficer, useOfficerAction } from '@/lib/officer';
import { useCampus } from '@/lib/useCampus';

type PathRow = { id: string; type: string; from: string; to: string; status: 'open' | 'congested' | 'blocked'; updated_by: string | null };
const STATUSES = [{ key: 'open', label: 'Open' }, { key: 'congested', label: 'Congested' }, { key: 'blocked', label: 'Blocked' }] as const;

/** Mark paths Open / Congested / Blocked. Every phone re-routes at once. */
export default function Paths() {
  const { snapshot } = useCampus();
  const [pick, setPick] = useState<{ building?: string; level?: number }>({});
  const building = snapshot?.buildings.find(b => b.id === pick.building) ?? snapshot?.buildings[0];
  const level = pick.level ?? building?.floors[0]?.level;
  const { data, error, refresh } = useOfficer<{ paths: PathRow[] }>(building ? `/api/officer/paths?building=${building.id}&level=${level}` : '');
  const action = useOfficerAction(refresh);

  return (
    <Screen title="Paths">
      <Text style={styles.meta}>Blocked paths are never routed; congested ones are avoided when there is another way.</Text>
      {snapshot && snapshot.buildings.length > 1 ? (
        <Section label="Building">
          <Chips items={snapshot.buildings.map(b => ({ key: b.id, label: b.name }))} active={building?.id ?? null} onSelect={id => setPick({ building: id })} />
        </Section>
      ) : null}
      {building ? (
        <Section label="Floor">
          <Chips items={building.floors.map(f => ({ key: String(f.level), label: f.name }))} active={String(level)}
            onSelect={l => setPick({ building: building.id, level: Number(l) })} />
        </Section>
      ) : null}
      {snapshot && building && level !== undefined ? <FloorPlan snapshot={snapshot} building={building.id} level={level} /> : null}
      <Message text={error ?? action.error} />
      {data?.paths.length === 0 ? <Text style={styles.meta}>No paths on this floor.</Text> : null}
      {data?.paths.map(p => (
        <View key={p.id} style={styles.row}>
          <Text style={styles.name}>{p.from} → {p.to}</Text>
          <Text style={styles.meta}>{p.type}{p.updated_by ? ` · changed by ${p.updated_by}` : ''}</Text>
          <Chips items={STATUSES.map(s => ({ key: s.key, label: s.label, a11yLabel: `${s.label}: ${p.from} to ${p.to}` }))} active={p.status}
            color={p.status === 'blocked' ? '#2B2F36' : p.status === 'congested' ? '#b07a00' : colors.primary}
            onSelect={status => status !== p.status && action.run(`/api/officer/paths/${encodeURIComponent(p.id)}`, 'PATCH', { status })} />
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 14, color: colors.muted },
  row: { padding: 12, borderRadius: 10, backgroundColor: colors.card, gap: 6 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
});
