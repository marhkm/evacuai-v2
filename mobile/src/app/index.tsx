import { HAZARDS } from '@evacuai/routing';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_URL } from '@/config';

type Status = 'checking' | 'online' | 'offline';

export default function HomeScreen() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then(r => setStatus(r.ok ? 'online' : 'offline'))
      .catch(() => setStatus('offline'));
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>EvacuAI</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Server</Text>
        <Text style={styles.value}>{API_URL}</Text>
        <Text style={[styles.value, status === 'online' ? styles.ok : status === 'offline' ? styles.bad : null]}>
          {status}
        </Text>
      </View>
      <Text style={styles.footer}>Hazards: {HAZARDS.join(', ')}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '700', color: '#1a7a3c' },
  card: { width: '100%', maxWidth: 420, padding: 16, borderRadius: 12, backgroundColor: '#f2f5f3', gap: 4 },
  label: { fontSize: 14, color: '#555' },
  value: { fontSize: 18, color: '#111' },
  ok: { color: '#1a7a3c', fontWeight: '700' },
  bad: { color: '#c0392b', fontWeight: '700' },
  footer: { fontSize: 14, color: '#555' },
});
