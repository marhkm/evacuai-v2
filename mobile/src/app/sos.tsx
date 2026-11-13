import { Redirect } from 'expo-router';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { LocationChooser } from '@/components/LocationChooser';
import { Button, Field, Message, Screen } from '@/components/ui';
import { fonts, makeStyles } from '@/theme';
import { api } from '@/lib/api';
import { medium, success } from '@/lib/haptics';
import { sendSos, type SosSource } from '@/lib/sendSos';
import { useAlerts } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';
import { dayLabel, startsDay, timeLabel } from '@/lib/chatTime';
import { subscribeSos } from '@/lib/realtime';
import { useCampus } from '@/lib/useCampus';
import { updateWhereabouts } from '@/lib/whereabouts';

type Sos = {
  id: number;
  status: 'pending' | 'acknowledged' | 'resolved' | 'cancelled';
  message: string | null;
  place: string | null;
  location_source?: SosSource | null;
  node_id?: string | null;
  room_id?: string | null;
  responder: string | null;
  created_at: string;
  messages: { id: number; body: string; mine: boolean; sender: string; created_at: string }[];
};

const isOpen = (s: Sos) => (s.status === 'pending' || s.status === 'acknowledged');
const MISTAKE_MS = 10_000; // "Cancel (sent by mistake)" is offered this long after sending
const sinceSent = (s: Sos) => Date.now() - Date.parse(s.created_at);

export default function SosScreen() {
  const styles = useStyles();
  const { state, token } = useAuth();
  const { active } = useAlerts();
  const { snapshot } = useCampus();
  const [sos, setSos] = useState<Sos | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [, rerender] = useState(0);
  const alertActive = !!active[0];

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

  // Hide "Cancel (sent by mistake)" once its 10 seconds are up.
  const mistakeLeft = sos && sos.status === 'pending' ? MISTAKE_MS - sinceSent(sos) : 0;
  useEffect(() => {
    if (mistakeLeft <= 0) return;
    const t = setTimeout(() => rerender(n => n + 1), mistakeLeft + 50);
    return () => clearTimeout(t);
  }, [mistakeLeft > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

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
        {sos.place && (sos.location_source === 'gps' || (sos.location_source === 'estimate' && !sos.room_id && !sos.node_id)) && !changing ? (
          <Message kind="info" text={`Officers know your building${sos.location_source === 'gps' ? ' from GPS' : ' (approximate)'}: ${sos.place}. Pick your room or scan a sticker so they find you faster.`} />
        ) : null}
        {sos.place && (sos.location_source === 'gps' || (sos.location_source === 'estimate' && !sos.room_id && !sos.node_id)) && !changing ? chooser(sos.id) : null}
        {sos.place && (sos.room_id || sos.node_id) && (sos.location_source === 'schedule' || sos.location_source === 'estimate') && !changing ? (
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
          <Button label={sinceSent(sos) < MISTAKE_MS ? 'Cancel (sent by mistake)' : "Cancel SOS (I'm safe now)"} variant="secondary"
            onPress={() => run(() => api(`/api/sos/${sos.id}/cancel`, { method: 'POST', token }))} />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen title="SOS">
      {sos?.status === 'resolved' ? <Message kind="info" text="Your last SOS was resolved by a safety officer." /> : null}
      <Text style={styles.intro}>Hurt, trapped or in danger? Tap Send SOS. Safety officers see where you are and can chat with you.</Text>
      <Message text={error} />
      <Button label="Send SOS" variant="danger" busy={busy}
        onPress={async () => {
          medium();
          if (await run(async () => { await sendSos(token!); return api<{ sos: Sos }>('/api/sos/current', { token }); })) success();
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
