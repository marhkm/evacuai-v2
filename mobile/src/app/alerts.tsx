import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Screen, colors } from '@/components/ui';
import { alertTitle, useAlerts } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';

const STATUS = { active: 'Active', resolved: 'Resolved', retracted: 'Retracted' } as const;

export default function Alerts() {
  const { state } = useAuth();
  const { alerts } = useAlerts();
  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  return (
    <Screen title="Alerts">
      {alerts.length === 0 ? <Text style={styles.empty}>No alerts in the last 30 days.</Text> : null}
      {alerts.map(a => (
        <View key={a.id} style={[styles.card, a.status === 'active' && styles.activeCard]}>
          <View style={styles.row}>
            <Text style={styles.title}>{alertTitle(a)}</Text>
            <Text style={[styles.status, a.status === 'active' && styles.activeStatus]}>{STATUS[a.status]}</Text>
          </View>
          <Text style={styles.message}>{a.message}</Text>
          {a.issued_at ? <Text style={styles.time}>{new Date(a.issued_at).toLocaleString()}</Text> : null}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 16, color: colors.muted },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 6 },
  activeCard: { borderColor: colors.danger, borderWidth: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, flexShrink: 1 },
  status: { fontSize: 14, color: colors.muted, fontWeight: '700' },
  activeStatus: { color: colors.danger },
  message: { fontSize: 16, color: colors.text, lineHeight: 22 },
  time: { fontSize: 13, color: colors.muted },
});
