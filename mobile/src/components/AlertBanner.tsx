import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { alertTitle, type AlertItem } from '@/lib/alerts';

export function AlertBanner({ alert }: { alert: AlertItem }) {
  const calm = alert.is_drill;
  return (
    <Pressable
      accessibilityRole="alert"
      accessibilityLabel={`${alertTitle(alert)}. ${alert.message}`}
      onPress={() => router.push('/alerts')}
      style={[styles.banner, calm ? styles.drill : styles.live]}
    >
      <Text style={styles.title}>{alertTitle(alert)}</Text>
      <Text style={styles.message}>{alert.message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: 12, padding: 16, gap: 6 },
  live: { backgroundColor: '#c0392b' },
  drill: { backgroundColor: '#b9770e' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  message: { color: '#fff', fontSize: 16, lineHeight: 22 },
});
