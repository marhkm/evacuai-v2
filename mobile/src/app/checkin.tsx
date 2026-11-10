import { displayName } from '@evacuai/campus-view';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { LocationChooser } from '@/components/LocationChooser';
import { Button, Message, Screen } from '@/components/ui';
import { fonts, makeStyles } from '@/theme';
import { ApiError, api } from '@/lib/api';
import { timeLabel } from '@/lib/chatTime';
import { confirm } from '@/lib/confirm';
import { success } from '@/lib/haptics';
import { useAlerts } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';
import { nearbyAssemblyPoint } from '@/lib/geofence';
import { useCampus } from '@/lib/useCampus';
import { updateWhereabouts } from '@/lib/whereabouts';

type Zone = { node_id: string; name: string; count: number; capacity: number | null; full: boolean };
type CheckIn = {
  alert_id: number; status: 'safe' | 'needs_help' | null; place: string | null; checked_in_at: string | null;
  zones?: Zone[]; history?: { place: string | null; at: string }[];
} | null;
type Source = 'qr' | 'list' | 'gps' | 'none';

/** "Open ground · 42 of 300", "· 42 here" without a capacity, "· Full" when full. */
const zoneLabel = (z: Zone) => `${z.name} · ${z.capacity === null ? `${z.count} here` : `${z.count} of ${z.capacity}`}${z.full ? ' · Full' : ''}`;

export default function CheckInScreen() {
  const styles = useStyles();
  const { state, token } = useAuth();
  const { active } = useAlerts();
  const { snapshot } = useCampus();
  const [checkIn, setCheckIn] = useState<CheckIn | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alertId = active[0]?.id;
  const [nearby, setNearby] = useState<string | null>(null); // assembly point node the phone's GPS is inside
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<{ check_in: CheckIn }>('/api/check-in', { token }).then(r => setCheckIn(r.check_in)).catch(e => setError((e as Error).message));
  }, [token, alertId]);

  // GPS geofence (spec §8): one reading, only while checking in during an alert.
  useEffect(() => {
    if (!snapshot || !alertId) return;
    let cancelled = false;
    nearbyAssemblyPoint(snapshot).then(ap => { if (!cancelled) setNearby(ap?.nodeId ?? null); });
    return () => { cancelled = true; };
  }, [snapshot, alertId]);

  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  /** "I'm safe" at a zone (or not). A second check-in asks first: every check-in is kept, the status only changes on Update. */
  async function send(source: Source, nodeId?: string, replace = false) {
    setError(null);
    setSuggestion(null);
    setBusy(true);
    try {
      const r = await api<{ check_in: CheckIn; suggest?: Zone | null }>('/api/check-in', {
        method: 'POST', token, body: { node_id: nodeId ?? null, source, ...(replace ? { replace: true } : {}) },
      });
      setCheckIn(r.check_in);
      success();
      const here = r.check_in?.zones?.find(z => z.node_id === nodeId);
      if (here?.full && r.suggest) setSuggestion(`${here.name} is full. ${r.suggest.name} has space.`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const { place, checked_in_at: at } = e.body as { place: string | null; checked_in_at: string };
        setBusy(false);
        const update = await confirm(`You already checked in${place ? ` at ${place}` : ''} at ${timeLabel(at)}. Update your status?`,
          'Your earlier check-in is kept in your history.', 'Update');
        if (update) await send(source, nodeId, true);
        return;
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (checkIn === undefined) return <Screen title="Check in"><Message text={error} /></Screen>;
  if (checkIn === null) {
    return (
      <Screen title="Check in">
        <Text style={styles.text}>There is no active alert. Check-in opens when an alert is broadcast.</Text>
      </Screen>
    );
  }

  const time = checkIn.checked_in_at ? new Date(checkIn.checked_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

  return (
    <Screen title="Check in">
      {checkIn.status ? (
        <View style={[styles.card, checkIn.status === 'safe' ? styles.safe : styles.help]}>
          <Text style={styles.status}>
            {checkIn.status === 'safe' ? `You checked in safe${checkIn.place ? ` at ${checkIn.place}` : ''}.` : 'You asked for help. Use SOS to reach a safety officer.'}
          </Text>
          <Text style={styles.meta}>{time}</Text>
        </View>
      ) : (
        <Text style={styles.text}>When you reach a safe zone, pick it below or scan its QR sticker so safety officers know you are safe.</Text>
      )}

      {nearby && snapshot && checkIn.status !== 'safe' ? (
        <View style={[styles.card, styles.safe]}>
          <Text style={styles.status}>You are at {displayName(snapshot, nearby)}.</Text>
          <Button label={`Check in safe at ${displayName(snapshot, nearby)}`} busy={busy} onPress={() => {
            const n = snapshot.nodes.find(x => x.id === nearby)!;
            // GPS suggested it, the user confirmed it: a confirmed location, like picking it by hand.
            updateWhereabouts({ source: 'manual', nodeId: n.id, building: n.building, floor: n.level }, token, true);
            send('gps', n.id);
          }} />
        </View>
      ) : null}
      <Message text={suggestion} kind="info" />
      <Text style={styles.heading}>{"I'm safe at a safe zone"}</Text>
      {(checkIn.zones ?? []).map(z => (
        <Button key={z.node_id} label={zoneLabel(z)} variant={z.full ? 'danger' : 'secondary'} busy={busy} onPress={() => {
          const n = snapshot?.nodes.find(x => x.id === z.node_id);
          if (n) updateWhereabouts({ source: 'manual', nodeId: n.id, building: n.building, floor: n.level }, token, true);
          send('list', z.node_id);
        }} />
      ))}
      <LocationChooser snapshot={snapshot} scanLabel="Scan safe zone QR" onNode={n => {
        if (n.type !== 'assembly_point') return setError('That sticker is not at a safe zone. Look for the safe zone sign.');
        updateWhereabouts({ source: 'qr', nodeId: n.id, building: n.building, floor: n.level }, token, true);
        send('qr', n.id);
      }} />
      <Message text={error} />
      <Button label="I'm safe (not at a safe zone)" variant="secondary" busy={busy} onPress={() => send('none')} />
      {(checkIn.history?.length ?? 0) > 1 ? (
        <>
          <Text style={styles.heading}>Earlier check-ins</Text>
          {checkIn.history!.slice(1).map(h => <Text key={h.at} style={styles.meta}>{`${timeLabel(h.at)} · ${h.place ?? 'Not at a safe zone'}`}</Text>)}
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  text: { fontFamily: fonts.body, fontSize: 17, color: c.text, lineHeight: 24 },
  card: { borderRadius: 12, padding: 14, gap: 4 },
  safe: { backgroundColor: c.safeTint },
  help: { backgroundColor: c.dangerTint },
  status: { fontFamily: fonts.bodyBold, fontSize: 19, color: c.text },
  meta: { fontFamily: fonts.body, fontSize: 15, color: c.muted },
  heading: { fontFamily: fonts.bodyBold, fontSize: 16, color: c.text, marginTop: 8 },
}));
