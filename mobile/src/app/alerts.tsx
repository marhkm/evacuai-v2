import { Redirect } from 'expo-router';
import { Text, View } from 'react-native';

import { Screen } from '@/components/ui';
import { fonts, makeStyles } from '@/theme';
import { alertTitle, alertTranslations, useAlerts } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';

const STATUS = { active: 'Active', resolved: 'Resolved', retracted: 'Retracted' } as const;

export default function Alerts() {
  const styles = useStyles();
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
          {alertTranslations(a).map(t => <Text key={t} style={styles.translation}>{t}</Text>)}
          {a.issued_at ? <Text style={styles.time}>{new Date(a.issued_at).toLocaleString()}</Text> : null}
        </View>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  empty: { fontFamily: fonts.body, fontSize: 16, color: c.muted },
  card: { borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, gap: 6 },
  activeCard: { borderColor: c.danger, borderWidth: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  title: { fontFamily: fonts.bodyBold, fontSize: 16, color: c.text, flexShrink: 1 },
  status: { fontFamily: fonts.bodyBold, fontSize: 14, color: c.muted },
  activeStatus: { color: c.danger },
  message: { fontFamily: fonts.body, fontSize: 16, color: c.text, lineHeight: 22 },
  translation: { fontFamily: fonts.body, fontSize: 15, color: c.muted, lineHeight: 21 },
  time: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
}));
