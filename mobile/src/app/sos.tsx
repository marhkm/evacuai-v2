import { displayName } from '@evacuai/campus-view';
import { Redirect } from 'expo-router';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { LocationChooser } from '@/components/LocationChooser';
import { Button, Field, Message, Screen } from '@/components/ui';
import { fonts, makeStyles } from '@/theme';
import { api } from '@/lib/api';
import { medium, success } from '@/lib/haptics';
import { useAlerts } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';
import { dayLabel, startsDay, timeLabel } from '@/lib/chatTime';
import type { Estimate, Observation } from '@/lib/estimator';
import { subscribeSos } from '@/lib/realtime';
import { useCampus } from '@/lib/useCampus';
import { lastNode, loadEstimate, updateWhereabouts } from '@/lib/whereabouts';

type Sos = {
  id: number;
  status: 'pending' | 'acknowledged' | 'resolved' | 'cancelled';
  message: string | null;
  place: string | null;
  location_source?: 'qr' | 'manual' | 'schedule' | 'estimate' | null;
  node_id?: string | null;
  room_id?: string | null;
  responder: string | null;
  created_at: string;
  messages: { id: number; body: string; mine: boolean; sender: string; created_at: string }[];
};

const isOpen = (s: Sos) => (s.status === 'pending' || s.status === 'acknowledged');

export default function SosScreen() {
  const styles = useStyles();
  const { state, token } = useAuth();
  const { active } = useAlerts();
  const { snapshot } = useCampus();
  const [sos, setSos] = useState<Sos | null>(null);
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A place picked or scanned on this screen; otherwise the estimate (today's pick, scan or class in session).
  const [picked, setPicked] = useState<{ nodeId: string | null; roomId: string | null; source: 'qr' | 'manual' } | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [changing, setChanging] = useState(false);
  const alertActive = !!active[0];
  useEffect(() => { loadEstimate(token, alertActive).then(setEstimate).catch(() => undefined); }, [token, alertActive]);

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

  const live = estimate; // as loaded: its source is all this screen needs
  const here = picked ? picked.nodeId : lastNode(snapshot);
  const hereRoom = picked ? picked.roomId : live?.roomId ?? null;
  // What the place is based on: a schedule guess asks the student to confirm it once the SOS is out.
  // Only a scan or a pick is a fact; a floor change or GPS reading is an estimate the student confirms after sending.
  const source = picked?.source ?? (live ? ({ schedule: 'schedule', qr: 'qr', manual: 'manual' } as const)[live.source as 'schedule'] ?? 'estimate' : null);

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
    updateWhereabouts(obs, token, alertActive);
    setPicked({ nodeId: node, roomId: obs.roomId ?? null, source: obs.source === 'qr' ? 'qr' : 'manual' });
  }

  /** After sending: move or confirm the open SOS's place; officers see it live. */
  async function relocate(id: number, place: { node_id?: string | null; room_id?: string | null }, how: 'qr' | 'manual') {
    if (await run(() => api(`/api/sos/${id}/location`, { method: 'PATCH', token, body: { ...place, location_source: how } }))) setChanging(false);
  }

  const chooser = (id: number) => (
    <LocationChooser snapshot={snapshot}
      onNode={n => {
        updateWhereabouts({ source: 'qr', nodeId: n.id, building: n.building, floor: n.level }, token, alertActive);
        relocate(id, { node_id: n.id }, 'qr');
      }}
      onRoom={roomId => {
        const room = snapshot!.rooms.find(r => r.id === roomId)!;
        updateWhereabouts({ source: 'manual', roomId, building: room.building, floor: room.level }, token, alertActive);
        relocate(id, { node_id: snapshot!.nodes.find(n => n.room_id === roomId && n.type !== 'hallway')?.id ?? null, room_id: roomId }, 'manual');
      }} />
  );

  if (sos && isOpen(sos)) {
    return (
      <Screen title="SOS sent">
        <View style={[styles.card, sos.status === 'pending' ? styles.pending : styles.responding]}>
          <Text style={styles.status}>
            {sos.status === 'pending' ? 'Waiting for a safety officer…' : `${sos.responder ?? 'A safety officer'} is responding.`}
          </Text>
          <Text style={styles.meta}>{sos.place ? `Your location: ${sos.place}` : 'Location not shared yet.'}</Text>
        </View>
        {sos.place && (sos.location_source === 'schedule' || sos.location_source === 'estimate') && !changing ? (
          <View style={styles.confirm}>
            <Text style={styles.body}>
              {`We sent ${sos.location_source === 'schedule' ? 'your class room' : 'your last known place'}: ${sos.place}. Are you there?`}
            </Text>
            <Button label="Yes" busy={busy} onPress={() => relocate(sos.id, { node_id: sos.node_id, room_id: sos.room_id }, 'manual')} />
            <Button label="No, change" variant="secondary" onPress={() => setChanging(true)} />
          </View>
        ) : null}
        {!sos.place ? <Message text="Location unknown. Pick your room or scan a sticker so officers can find you." /> : null}
        {!sos.place || changing ? chooser(sos.id) : null}
        <Text style={styles.heading}>Chat with safety officers</Text>
        {sos.messages.length === 0 ? <Text style={styles.meta}>No messages yet.</Text> : null}
        {sos.messages.map((m, i) => (
          <Fragment key={m.id}>
          {startsDay(sos.messages, i) ? <Text accessibilityRole="header" style={styles.day}>{dayLabel(m.created_at)}</Text> : null}
          <View style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
            <Text style={styles.sender}>{m.mine ? 'You' : m.sender}{timeLabel(m.created_at) ? ` · ${timeLabel(m.created_at)}` : ''}</Text>
            <Text style={styles.body}>{m.body}</Text>
          </View>
          </Fragment>
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
        {here && snapshot ? `Your location: ${displayName(snapshot, here)}${source === 'schedule' ? ' (from your class schedule)' : ''}`
          : 'Location unknown. Scan a sticker or pick your room so officers can find you.'}
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
        onPress={async () => {
          medium();
          const body = { node_id: here ?? null, room_id: hereRoom, location_source: here || hereRoom ? source : null, message: note.trim() || null };
          if (await run(() => api('/api/sos', { method: 'POST', token, body }))) success(); // sent at once, even without a place
        }} />
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  confirm: { borderRadius: 12, padding: 14, gap: 8, backgroundColor: c.warningTint },
  intro: { fontFamily: fonts.body, fontSize: 17, color: c.text, lineHeight: 24 },
  where: { fontFamily: fonts.body, fontSize: 15, color: c.muted },
  card: { borderRadius: 12, padding: 14, gap: 6 },
  pending: { backgroundColor: c.dangerTint },
  responding: { backgroundColor: c.warningTint },
  status: { fontFamily: fonts.bodyBold, fontSize: 19, color: c.text },
  meta: { fontFamily: fonts.body, fontSize: 15, color: c.muted },
  heading: { fontFamily: fonts.bodyBold, fontSize: 17, color: c.text },
  bubble: { borderRadius: 12, padding: 10, maxWidth: '85%' },
  mine: { alignSelf: 'flex-end', backgroundColor: c.safeTint },
  theirs: { alignSelf: 'flex-start', backgroundColor: c.card },
  sender: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  day: { alignSelf: 'center', fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: c.muted },
  body: { fontFamily: fonts.body, fontSize: 16, color: c.text },
}));
