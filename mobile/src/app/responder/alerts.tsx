import { useState } from 'react';
import { Text, View } from 'react-native';

import { Chips, Section } from '@/components/Chips';
import { Button, Field, Message, Screen } from '@/components/ui';
import { fonts, makeStyles } from '@/theme';
import type { AlertItem } from '@/lib/alerts';
import { confirm } from '@/lib/confirm';
import { useOfficer, useOfficerAction } from '@/lib/officer';
import { useCampus } from '@/lib/useCampus';

type Alert = Omit<AlertItem, 'status'> & { status: AlertItem['status'] | 'draft' };

const HAZARDS = [
  { key: 'fire', label: 'Fire' }, { key: 'earthquake', label: 'Earthquake' }, { key: 'flood', label: 'Flood' },
  { key: 'structural_damage', label: 'Structural damage' }, { key: 'other', label: 'Other' },
];
const SEVERITIES = ['low', 'medium', 'high', 'critical'].map(s => ({ key: s, label: s }));

/** Broadcast and manage alerts. */
export default function Alerts() {
  const styles = useStyles();
  const { snapshot } = useCampus();
  const { data, error, refresh } = useOfficer<{ alerts: Alert[] }>('/api/officer/alerts');
  const action = useOfficerAction(refresh);
  const empty = { hazard: 'fire', severity: 'high', building: '', drill: false, message: '' };
  const [form, setForm] = useState(empty);
  const set = (patch: Partial<typeof empty>) => setForm(f => ({ ...f, ...patch }));

  async function broadcast() {
    if (!form.message.trim()) return;
    const body = { hazard_type: form.hazard, severity_level: form.severity, building_id: form.building || null, message: form.message.trim(), is_drill: form.drill };
    const first = await action.run<{ needs_confirmation?: boolean; reporters?: number }>('/api/officer/alerts', 'POST', body);
    if (!first) return;
    if (first.needs_confirmation) {
      const n = first.reporters ?? 0;
      const ok = await confirm('Confirm this incident', `Only ${n} matching report${n === 1 ? '' : 's'} so far (3 are needed). Broadcast only if you checked it directly.`, 'Broadcast');
      if (!ok || !(await action.run('/api/officer/alerts', 'POST', { ...body, confirm: true }))) return;
    }
    setForm(empty);
  }

  const act = async (a: Alert, verb: string, question: string, body?: unknown) => {
    if (await confirm(question, a.message, 'Yes')) action.run(`/api/officer/alerts/${a.id}/${verb}`, 'POST', body);
  };
  const shown = data?.alerts.filter(a => a.status === 'active' || a.status === 'draft') ?? [];

  return (
    <Screen title="Alerts">
      <Text style={styles.heading}>Broadcast an alert</Text>
      <Section label="Hazard"><Chips items={HAZARDS} active={form.hazard} onSelect={hazard => set({ hazard })} tone="danger" /></Section>
      <Section label="Severity"><Chips items={SEVERITIES} active={form.severity} onSelect={severity => set({ severity })} /></Section>
      {snapshot ? (
        <Section label="Building">
          <Chips items={[{ key: '', label: 'Campus-wide' }, ...snapshot.buildings.map(b => ({ key: b.id, label: b.name }))]} active={form.building}
            onSelect={building => set({ building })} />
        </Section>
      ) : null}
      <Section label="Type">
        <Chips items={[{ key: 'real', label: 'Real emergency' }, { key: 'drill', label: 'Drill' }]} active={form.drill ? 'drill' : 'real'}
          onSelect={k => set({ drill: k === 'drill' })} />
      </Section>
      <Field label="Message" value={form.message} onChangeText={message => set({ message })} multiline maxLength={500} autoCapitalize="sentences" />
      <Message text={action.error} />
      <Button label="Broadcast" variant="danger" busy={action.busy} onPress={broadcast} />

      <Text style={styles.heading}>Active and draft</Text>
      <Message text={error} />
      {data && shown.length === 0 ? <Text style={styles.meta}>No active alerts or drafts.</Text> : null}
      {shown.map(a => (
        <View key={a.id} style={[styles.card, a.status === 'draft' && styles.draft]}>
          <Text style={styles.title}>{a.status === 'draft' ? 'Draft' : a.is_drill ? 'Drill' : 'Active'} · {a.hazard_type.replace('_', ' ')} · {a.severity_level}{a.status === 'active' && !a.verified ? ' · unverified' : ''}</Text>
          <Text style={styles.body}>{a.message}</Text>
          {a.status === 'draft' ? (
            <>
              <Button label="Publish" a11yLabel={`Publish: ${a.message}`} onPress={() => act(a, 'publish', 'Publish this alert to everyone?', { message: a.message })} />
              <Button label="Discard" variant="secondary" a11yLabel={`Discard: ${a.message}`} onPress={() => act(a, 'discard', 'Discard this draft?')} />
            </>
          ) : (
            <>
              {!a.verified ? <Button label="Confirm" a11yLabel={`Confirm: ${a.message}`} onPress={() => act(a, 'confirm', 'Mark this alert as verified?')} /> : null}
              <Button label="Resolve" a11yLabel={`Resolve: ${a.message}`} onPress={() => act(a, 'resolve', 'Resolve this alert? Everyone is told it is over.')} />
              <Button label="Retract" variant="secondary" a11yLabel={`Retract: ${a.message}`} onPress={() => act(a, 'retract', 'Retract this alert as a false alarm?')} />
            </>
          )}
        </View>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  heading: { fontFamily: fonts.bodyBold, fontSize: 18, color: c.text, marginTop: 8 },
  meta: { fontFamily: fonts.body, fontSize: 14, color: c.muted },
  card: { padding: 12, borderRadius: 10, backgroundColor: c.dangerTint, gap: 8 },
  draft: { backgroundColor: c.card },
  title: { fontFamily: fonts.bodyBold, fontSize: 15, color: c.text, textTransform: 'capitalize' },
  body: { fontFamily: fonts.body, fontSize: 16, color: c.text },
}));
