import { Redirect, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AlertBanner } from '@/components/AlertBanner';
import { Button, Screen, colors } from '@/components/ui';
import { useAlerts } from '@/lib/alerts';
import { getServerUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { state } = useAuth();
  const { active } = useAlerts();

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (state.status === 'signedOut') return <Redirect href="/login" />;
  if (!state.user.consented) return <Redirect href="/consent" />;

  return (
    <Screen title="EvacuAI">
      {active.map(a => <AlertBanner key={a.id} alert={a} />)}
      <Text style={styles.welcome}>Welcome, {state.user.name}</Text>
      <Text style={styles.meta}>{state.user.role.replace('_', ' ')} · {getServerUrl()}</Text>
      <Button label="SOS" variant="danger" onPress={() => router.push('/sos')} />
      {active.length ? <Button label="Check in safe" onPress={() => router.push('/checkin')} /> : null}
      <Button label="Evacuation route" onPress={() => router.push('/route')} />
      <Button label="Report a hazard" variant="danger" onPress={() => router.push('/report')} />
      <Button label="Campus map" variant="secondary" onPress={() => router.push('/map')} />
      <Button label="Alerts" variant="secondary" onPress={() => router.push('/alerts')} />
      <Button label="Profile" variant="secondary" onPress={() => router.push('/profile')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcome: { fontSize: 22, fontWeight: '700', color: colors.text },
  meta: { fontSize: 15, color: colors.muted },
});
