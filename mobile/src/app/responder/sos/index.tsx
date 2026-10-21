import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { Message, Screen } from '@/components/ui';
import { fonts, makeStyles } from '@/theme';
import { useOfficer } from '@/lib/officer';

export type SosItem = { id: number; person: string | null; place: string | null; status: string; message: string | null; created_at: string };

export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });

/** Open SOS requests, newest first; updates live. */
export default function SosInbox() {
  const styles = useStyles();
  const { data, error } = useOfficer<{ sos: SosItem[] }>('/api/officer/sos?open=1');

  return (
    <Screen title="SOS inbox">
      <Message text={error} />
      {data?.sos.length === 0 ? <Text style={styles.empty}>No open SOS. New requests appear here instantly.</Text> : null}
      {data?.sos.map(s => (
        <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`${s.person ?? 'Someone'}, ${s.place ?? 'location not shared'}, ${s.status}`}
          onPress={() => router.push(`/responder/sos/${s.id}`)} style={[styles.item, s.status === 'pending' && styles.pending]}>
          <Text style={styles.person}>{s.person ?? 'Someone'}</Text>
          <Text style={styles.place}>{s.place ?? 'Location not shared'}</Text>
          {s.message ? <Text style={styles.place}>“{s.message}”</Text> : null}
          <Text style={styles.meta}>{s.status === 'pending' ? 'Waiting for an officer' : 'Acknowledged'} · {clock(s.created_at)}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  empty: { fontFamily: fonts.body, fontSize: 16, color: c.muted },
  item: { padding: 14, borderRadius: 10, backgroundColor: c.card, borderLeftWidth: 5, borderLeftColor: c.warning, gap: 2 },
  pending: { borderLeftColor: c.danger },
  person: { fontFamily: fonts.bodyBold, fontSize: 18, color: c.text },
  place: { fontFamily: fonts.body, fontSize: 15, color: c.text },
  meta: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
}));
