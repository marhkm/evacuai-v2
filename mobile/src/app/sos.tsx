import { displayName } from '@evacuai/campus-view';
import { Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LocationChooser } from '@/components/LocationChooser';
import { Button, Field, Message, Screen, colors } from '@/components/ui';
import { api } from '@/lib/api';
import { useAlerts } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';
import type { Observation } from '@/lib/estimator';
import { subscribeSos } from '@/lib/realtime';
import { useCampus } from '@/lib/useCampus';
import { lastNode, updateWhereabouts } from '@/lib/whereabouts';

type Sos = {
  id: number;
  status: 'pending' | 'acknowledged' | 'resolved' | 'cancelled';
  message: string | null;
  place: string | null;
  responder: string | null;
  created_at: string;
  messages: { id: number; body: string; mine: boolean; sender: string; created_at: string }[];
};

const isOpen = (s: Sos) => (s.status === 'pending' || s.status === 'acknowledged');

export default function SosScreen() {
  const { state, token } = useAuth();
  const { active } = useAlerts();
  const { snapshot } = useCampus();
  const [sos, setSos] = useState<Sos | null>(null);
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nodeId, setNodeId] = useState<string | null>(null);

  const refresh = useCallback(
    () => (token ? api<{ sos: Sos | null }>('/api/sos/current', { token }).then(r => setSos(r.sos)).catch(() => undefined) : Promise.resolve()),
    [token],
  );
  useEffect(() => { refresh(); }, [refresh]);

  const openId = sos && isOpen(sos) ? sos.id : null;
  useEffect(() => {
    if (!openId || !token) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    subscribeSos(openId, token, refresh).then(u => (cancelled ? u() : (unsubscribe = u))).catch(() => undefined);
    const poll = setInterval(refresh, 10_000); // fallback when the realtime connection is down
    return () => { cancelled = true; unsubscribe?.(); clearInterval(poll); };
  }, [openId, token, refresh]);

  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const here = nodeId ?? lastNode(snapshot);

  async function run(action: () => Promise<{ sos: Sos }>) {
    setError(null);
    setBusy(true);
    try {
      setSos((await action()).sos);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function locate(obs: Observation, node: string | null) {
    updateWhereabouts(obs, token, !!active[0]);
    setNodeId(node);
  }

  if (sos && isOpen(sos)) {
    return (
      <Screen title="SOS sent">
        <View style={[styles.card, sos.status === 'pending' ? styles.pending : styles.responding]}>
          <Text style={styles.status}>
            {sos.status === 'pending' ? 'Waiting for a safety officer…' : `${sos.responder ?? 'A safety officer'} is responding.`}
          </Text>
          <Text style={styles.meta}>{sos.place ? `Your location: ${sos.place}` : 'Location not shared. Tell the officer where you are.'}</Text>
        </View>
        <Text style={styles.heading}>Chat with safety officers</Text>
        {sos.messages.length === 0 ? <Text style={styles.meta}>No messages yet.</Text> : null}
        {sos.messages.map(m => (
          <View key={m.id} style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
            <Text style={styles.sender}>{m.mine ? 'You' : m.sender}</Text>
            <Text style={styles.body}>{m.body}</Text>
          </View>
        ))}
        <Field label="Message" value={reply} onChangeText={setReply} maxLength={500} placeholder="e.g. I'm under the table near the door" autoCapitalize="sentences" />
        <Message text={error} />
        <Button label="Send message" busy={busy} onPress={async () => {
          if (!reply.trim()) return;
          if (await run(() => api(`/api/sos/${sos.id}/messages`, { method: 'POST', token, body: { body: reply } }))) setReply('');
        }} />
        {sos.status === 'pending' ? (
          <Button label="Cancel SOS (I'm safe now)" variant="secondary" onPress={() => run(() => api(`/api/sos/${sos.id}/cancel`, { method: 'POST', token }))} />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen title="SOS">
      {sos?.status === 'resolved' ? <Message kind="info" text="Your last SOS was resolved by a safety officer." /> : null}
      <Text style={styles.intro}>Hurt, trapped or in danger? Send an SOS. Safety officers see your location and can chat with you.</Text>
      <Text style={styles.where}>
        {here && snapshot ? `Your location: ${displayName(snapshot, here)}` : 'Location unknown. Scan a sticker or pick your room so officers can find you.'}
      </Text>
      <LocationChooser snapshot={snapshot}
        onNode={n => locate({ source: 'qr', nodeId: n.id, building: n.building, floor: n.level }, n.id)}
        onRoom={id => {
          const room = snapshot!.rooms.find(r => r.id === id)!;
          const node = snapshot!.nodes.find(n => n.room_id === id && n.type !== 'hallway')?.id ?? null;
          locate({ source: 'manual', roomId: id, building: room.building, floor: room.level }, node);
        }} />
      <Field label="What happened? (optional)" value={note} onChangeText={setNote} multiline maxLength={500} autoCapitalize="sentences" />
      <Message text={error} />
      <Button label="Send SOS" variant="danger" busy={busy}
        onPress={() => run(() => api('/api/sos', { method: 'POST', token, body: { node_id: here, message: note.trim() || null } }))} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 17, color: colors.text, lineHeight: 24 },
  where: { fontSize: 15, color: colors.muted },
  card: { borderRadius: 12, padding: 14, gap: 6 },
  pending: { backgroundColor: '#fdecea' },
  responding: { backgroundColor: '#fff4e0' },
  status: { fontSize: 19, fontWeight: '800', color: colors.text },
  meta: { fontSize: 15, color: colors.muted },
  heading: { fontSize: 17, fontWeight: '700', color: colors.text },
  bubble: { borderRadius: 12, padding: 10, maxWidth: '85%' },
  mine: { alignSelf: 'flex-end', backgroundColor: '#e3f1e8' },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card },
  sender: { fontSize: 12, color: colors.muted },
  body: { fontSize: 16, color: colors.text },
});
