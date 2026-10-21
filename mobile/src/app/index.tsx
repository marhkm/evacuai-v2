import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AlertBanner } from '@/components/AlertBanner';
import { Button, Screen, colors } from '@/components/ui';
import { useAlerts } from '@/lib/alerts';
import { getServerUrl } from '@/lib/api';
import { isOfficer, useAuth } from '@/lib/auth';

export default function Home() {
  const { state } = useAuth();
  const { active } = useAlerts();
  const { student } = useLocalSearchParams<{ student?: string }>();

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (state.status === 'signedOut') return <Redirect href="/login" />;
  if (!state.user.consented) return <Redirect href="/consent" />;
  const officer = isOfficer(state.user);
  if (officer && !student) return <Redirect href="/responder" />; // officers open on their own home

  return (
    <Screen title="EvacuAI">
      {active.map(a => <AlertBanner key={a.id} alert={a} />)}
      <Text style={styles.welcome}>Welcome, {state.user.name}</Text>
      <Text style={styles.meta}>{state.user.role.replace('_', ' ')} · {getServerUrl()}</Text>
      {officer ? <Button label="Responder mode" onPress={() => router.replace('/responder')} /> : null}
      <Button label="SOS" variant="danger" onPress={() => router.push('/sos')} />
      {active.length ? <Button label="Check in safe" onPress={() => router.push('/checkin')} /> : null}
      <Button label="Evacuation route" onPress={() => router.push('/route')} />
      <Button label="Report a hazard" variant="danger" onPress={() => router.push('/report')} />
      <Button label="Campus map" variant="secondary" onPress={() => router.push('/map')} />
      <Button label="Alerts" variant="secondary" onPress={() => router.push('/alerts')} />
      <Button label="Profile" variant="secondary" onPress={() => router.push('/profile')} />
      <Button label="Send feedback" variant="secondary" onPress={() => router.push('/feedback')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcome: { fontSize: 22, fontWeight: '700', color: colors.text },
  meta: { fontSize: 15, color: colors.muted },
});
