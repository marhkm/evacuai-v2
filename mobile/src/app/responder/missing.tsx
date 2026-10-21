import { Linking, Pressable, Text, View } from 'react-native';

import { Chip, Message, Screen, type Tone } from '@/components/ui';
import { fonts, makeStyles } from '@/theme';
import { useOfficer } from '@/lib/officer';

type Person = { id: number; name: string; role: string; status: string; place: string | null; source: string | null; phone: string | null };
type Board = { counts: { safe: number; needs_help: number; unknown: number; sos: number } | null; people: Person[] };

const LABEL: Record<string, string> = { SOS: 'SOS', needs_help: 'Needs help', unknown: 'Unknown' };
const TONE: Record<string, Tone> = { SOS: 'danger', needs_help: 'warning', unknown: 'neutral' };

/** People with an SOS, who need help or have not checked in, for the active alert. In memory only. */
export default function Missing() {
  const styles = useStyles();
  const { data, error } = useOfficer<Board>('/api/officer/safety');
  const people = data?.people.filter(p => p.status in LABEL) ?? []; // already sorted: SOS, needs help, unknown
  const c = data?.counts;

  return (
    <Screen title="Who's missing">
      <Message text={error} />
      {data && !c ? <Text style={styles.meta}>No active alert. This list fills in when an alert or drill starts.</Text> : null}
      {c ? (
        <Text style={styles.summary}>
          {c.sos} SOS · {c.needs_help} need help · {c.unknown} unknown · {c.safe} safe
        </Text>
      ) : null}
      {c && people.length === 0 ? <Message kind="info" text="Everyone is accounted for." /> : null}
      {people.map(p => (
        <View key={p.id} style={styles.row}>
          <View style={styles.grow}>
            <Text style={styles.name}>{p.name}</Text>
            <Text style={styles.meta}>{p.place ?? 'No location shared'}</Text>
          </View>
          <Chip label={LABEL[p.status]} tone={TONE[p.status]} />
          {p.phone ? (
            <Pressable accessibilityRole="link" accessibilityLabel={`Call ${p.name}`} onPress={() => Linking.openURL(`tel:${p.phone}`)} hitSlop={8}>
              <Text style={styles.call}>Call</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  summary: { fontFamily: fonts.bodyBold, fontSize: 16, color: c.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: c.card },
  grow: { flex: 1 },
  name: { fontFamily: fonts.bodyBold, fontSize: 17, color: c.text },
  meta: { fontFamily: fonts.body, fontSize: 14, color: c.muted },
  call: { fontFamily: fonts.bodyBold, color: c.infoText, fontSize: 16, paddingHorizontal: 4 },
}));
