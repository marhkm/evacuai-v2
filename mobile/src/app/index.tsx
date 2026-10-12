import { Redirect, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button, Screen, colors } from '@/components/ui';
import { getServerUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { state } = useAuth();

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
      <Text style={styles.welcome}>Welcome, {state.user.name}</Text>
      <Text style={styles.meta}>{state.user.role.replace('_', ' ')} · {getServerUrl()}</Text>
      <Text style={styles.meta}>Alerts, evacuation routes, SOS and check-in arrive in the next builds.</Text>
      <Button label="Profile" variant="secondary" onPress={() => router.push('/profile')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcome: { fontSize: 22, fontWeight: '700', color: colors.text },
  meta: { fontSize: 15, color: colors.muted },
});
