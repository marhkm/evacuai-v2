import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LocationChooser } from '@/components/LocationChooser';
import { Button, Message, Screen, colors } from '@/components/ui';
import { api } from '@/lib/api';
import { useAlerts } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/useCampus';
import { updateWhereabouts } from '@/lib/whereabouts';

type CheckIn = { alert_id: number; status: 'safe' | 'needs_help' | null; place: string | null; checked_in_at: string | null } | null;

export default function CheckInScreen() {
  const { state, token } = useAuth();
  const { active } = useAlerts();
  const { snapshot } = useCampus();
  const [checkIn, setCheckIn] = useState<CheckIn | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alertId = active[0]?.id;

  useEffect(() => {
    if (!token) return;
    api<{ check_in: CheckIn }>('/api/check-in', { token }).then(r => setCheckIn(r.check_in)).catch(e => setError((e as Error).message));
  }, [token, alertId]);

  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  async function send(status: 'safe' | 'needs_help', nodeId?: string) {
    setError(null);
    setBusy(true);
    try {
      setCheckIn((await api<{ check_in: CheckIn }>('/api/check-in', { method: 'POST', token, body: { status, node_id: nodeId ?? null } })).check_in);
    } catch (e) {
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
            {checkIn.status === 'safe' ? `You checked in safe${checkIn.place ? ` at ${checkIn.place}` : ''}.` : 'You said you need help.'}
          </Text>
          <Text style={styles.meta}>{time}</Text>
        </View>
      ) : (
        <Text style={styles.text}>When you reach the assembly point, scan its QR sticker so safety officers know you are safe.</Text>
      )}

      <LocationChooser snapshot={snapshot} scanLabel="Scan assembly point QR" onNode={n => {
        if (n.type !== 'assembly_point') return setError('That sticker is not at an assembly point. Look for the assembly point sign.');
        updateWhereabouts({ source: 'qr', nodeId: n.id, building: n.building, floor: n.level }, token, true);
        send('safe', n.id);
      }} />
      <Message text={error} />
      <Button label="I'm safe (not at an assembly point)" variant="secondary" busy={busy} onPress={() => send('safe')} />
      <Button label="I need help" variant="danger" busy={busy} onPress={() => send('needs_help')} />
      {checkIn.status === 'needs_help' ? <Button label="Send SOS" variant="danger" onPress={() => router.push('/sos')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 17, color: colors.text, lineHeight: 24 },
  card: { borderRadius: 12, padding: 14, gap: 4 },
  safe: { backgroundColor: '#e3f1e8' },
  help: { backgroundColor: '#fdecea' },
  status: { fontSize: 19, fontWeight: '800', color: colors.text },
  meta: { fontSize: 15, color: colors.muted },
});
