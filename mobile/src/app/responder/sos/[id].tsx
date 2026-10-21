import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field, Message, Screen, colors } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { useOfficer, useOfficerAction } from '@/lib/officer';

import { clock, type SosItem } from './index';

type Sos = SosItem & { responder: string | null; messages: { id: number; body: string; mine: boolean; sender: string; created_at: string }[] };

/** One SOS: where they are, the conversation, Acknowledge / Resolve. */
export default function SosChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, refresh } = useOfficer<{ sos: Sos }>(`/api/officer/sos/${id}`);
  const action = useOfficerAction(refresh);
  const [reply, setReply] = useState('');
  const s = data?.sos;

  if (!s) return <Screen title="SOS"><Message text={error} />{error ? null : <Text style={styles.meta}>Loading…</Text>}</Screen>;
  const open = s.status === 'pending' || s.status === 'acknowledged';

  async function send() {
    const body = reply.trim();
    if (!body) return;
    if (await action.run(`/api/officer/sos/${s!.id}/messages`, 'POST', { body })) setReply('');
  }

  return (
    <Screen title={`SOS: ${s.person ?? 'Someone'}`}>
      <View style={[styles.card, s.status === 'pending' ? styles.pending : styles.responding]}>
        <Text style={styles.place}>{s.place ?? 'Location not shared. Ask where they are.'}</Text>
        {s.message ? <Text style={styles.body}>“{s.message}”</Text> : null}
        <Text style={styles.meta}>
          {s.status} · sent {clock(s.created_at)}{s.responder ? ` · acknowledged by ${s.responder}` : ''}
        </Text>
      </View>
      {s.status === 'pending' ? <Button label="Acknowledge" variant="danger" busy={action.busy} onPress={() => action.run(`/api/officer/sos/${s.id}/acknowledge`)} /> : null}
      {s.messages.length === 0 ? <Text style={styles.meta}>No messages yet. Tell them help is coming.</Text> : null}
      {s.messages.map(m => (
        <View key={m.id} style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
          <Text style={styles.meta}>{m.mine ? 'You' : m.sender} · {clock(m.created_at)}</Text>
          <Text style={styles.body}>{m.body}</Text>
        </View>
      ))}
      <Message text={action.error} />
      {open ? (
        <>
          <Field label="Message" value={reply} onChangeText={setReply} maxLength={500} autoCapitalize="sentences" placeholder="e.g. Stay where you are, we are coming" />
          <Button label="Send" busy={action.busy} onPress={send} />
          <Button label="Resolve" variant="secondary" onPress={async () => {
            if (await confirm('Resolve this SOS?', 'Only when the person is safe or with a responder.', 'Resolve')) action.run(`/api/officer/sos/${s.id}/resolve`);
          }} />
        </>
      ) : <Message kind="info" text="This SOS is closed." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 14, gap: 6 },
  pending: { backgroundColor: '#fdecea' },
  responding: { backgroundColor: '#fff4e0' },
  place: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  bubble: { borderRadius: 12, padding: 10, maxWidth: '85%' },
  mine: { alignSelf: 'flex-end', backgroundColor: '#e3f1e8' },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card },
});
