import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Message, Screen, colors } from '@/components/ui';
import { useOfficer } from '@/lib/officer';

export type SosItem = { id: number; person: string | null; place: string | null; status: string; message: string | null; created_at: string };

export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });

/** Open SOS requests, newest first; updates live. */
export default function SosInbox() {
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

const styles = StyleSheet.create({
  empty: { fontSize: 16, color: colors.muted },
  item: { padding: 14, borderRadius: 10, backgroundColor: colors.card, borderLeftWidth: 5, borderLeftColor: '#e0a400', gap: 2 },
  pending: { borderLeftColor: colors.danger },
  person: { fontSize: 18, fontWeight: '700', color: colors.text },
  place: { fontSize: 15, color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
});
