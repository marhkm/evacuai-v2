import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { AlertBanner } from '@/components/AlertBanner';
import { Button, Counter, Message, Screen } from '@/components/ui';
import { fonts, makeStyles } from '@/theme';
import { useAlerts } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';
import { useOfficer } from '@/lib/officer';

type Overview = { stats: { open_sos: number; pending_reports: number; blocked_paths: number } };

/** Officers' home: open SOS first, then who's missing, paths and alerts. */
export default function ResponderHome() {
  const styles = useStyles();
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
        <Counter value={s?.open_sos} label="Open SOS" tone="danger" />
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

const useStyles = makeStyles(c => ({
  meta: { fontFamily: fonts.body, fontSize: 15, color: c.muted },
  counters: { flexDirection: 'row', gap: 8 },
}));
