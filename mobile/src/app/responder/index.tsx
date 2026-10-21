import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AlertBanner } from '@/components/AlertBanner';
import { Button, Message, Screen, colors } from '@/components/ui';
import { useAlerts } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';
import { useOfficer } from '@/lib/officer';

type Overview = { stats: { open_sos: number; pending_reports: number; blocked_paths: number } };

/** Officers' home: open SOS first, then who's missing, paths and alerts. */
export default function ResponderHome() {
  const { state } = useAuth();
  const { active } = useAlerts();
  const { data, error } = useOfficer<Overview>('/api/officer/overview');
  const s = data?.stats;
  const name = state.status === 'signedIn' ? state.user.name : '';

  return (
    <Screen title="Responder">
      {active.map(a => <AlertBanner key={a.id} alert={a} />)}
      <Text style={styles.meta}>{name} · safety officer tools</Text>
      <View style={styles.counters}>
        <Counter value={s?.open_sos} label="Open SOS" color={colors.danger} />
        <Counter value={s?.pending_reports} label="New reports" />
        <Counter value={s?.blocked_paths} label="Blocked paths" />
      </View>
      <Message text={error} />
      <Button label={s?.open_sos ? `SOS inbox (${s.open_sos} open)` : 'SOS inbox'} variant="danger" onPress={() => router.push('/responder/sos')} />
      <Button label="Who's missing" onPress={() => router.push('/responder/missing')} />
      <Button label="Paths" onPress={() => router.push('/responder/paths')} />
      <Button label="Alerts" onPress={() => router.push('/responder/alerts')} />
      <Button label="Student view" variant="secondary" onPress={() => router.push('/?student=1')} />
      <Button label="Profile" variant="secondary" onPress={() => router.push('/profile')} />
    </Screen>
  );
}

function Counter({ value, label, color = colors.text }: { value?: number; label: string; color?: string }) {
  return (
    <View style={styles.counter} accessible accessibilityLabel={`${label}: ${value ?? 'loading'}`}>
      <Text style={[styles.number, { color }]}>{value ?? '–'}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 15, color: colors.muted },
  counters: { flexDirection: 'row', gap: 8 },
  counter: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: colors.card },
  number: { fontSize: 32, fontWeight: '800' },
  label: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
