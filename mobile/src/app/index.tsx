import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { AlertBanner } from '@/components/AlertBanner';
import { Button, Screen } from '@/components/ui';
import { useAlerts } from '@/lib/alerts';
import { getServerUrl } from '@/lib/api';
import { isOfficer, useAuth } from '@/lib/auth';
import { fonts, makeStyles, useTheme } from '@/theme';

/**
 * Home, Signage style: during an alert the band and one big EVACUATE NOW lead, with SOS right below; otherwise a calm
 * all-clear and the everyday tools.
 */
export default function Home() {
  const s = useStyles();
  const c = useTheme();
  const { state } = useAuth();
  const { active } = useAlerts();
  const { student } = useLocalSearchParams<{ student?: string }>();

  if (state.status === 'loading') {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={c.safe} />
      </View>
    );
  }
  if (state.status === 'signedOut') return <Redirect href="/login" />;
  if (!state.user.consented) return <Redirect href="/consent" />;
  const officer = isOfficer(state.user);
  if (officer && !student) return <Redirect href="/responder" />; // officers open on their own home
  const alert = active.length > 0;

  return (
    <Screen title="EvacuAI">
      <Text style={s.welcome}>Welcome, {state.user.name}</Text>
      {active.map(a => <AlertBanner key={a.id} alert={a} />)}
      {alert ? (
        <Button hero variant="safe" label="Evacuate now" a11yLabel="Evacuate now: evacuation route" onPress={() => router.push('/route')} />
      ) : (
        <View style={s.clear} accessible accessibilityLabel="No active alerts. Campus is clear.">
          <Text style={s.clearTitle}>All clear</Text>
          <Text style={s.clearText}>No active alerts. Know your way out before you need it.</Text>
        </View>
      )}
      <View style={s.row}>
        <View style={s.grow}><Button hero={alert} variant="danger" label="SOS" onPress={() => router.push('/sos')} /></View>
        {alert ? <View style={s.grow}><Button hero variant="primary" label="Check in safe" onPress={() => router.push('/checkin')} /></View> : null}
      </View>
      {!alert ? <Button variant="safe" label="Evacuation route" onPress={() => router.push('/route')} /> : null}
      {officer ? <Button label="Responder mode" onPress={() => router.replace('/responder')} /> : null}
      <View style={s.tiles}>
        <Tile label="Report a hazard" icon="⚠" tone="danger" onPress={() => router.push('/report')} />
        <Tile label="Campus map" icon="▦" onPress={() => router.push('/map')} />
        <Tile label="Alerts" icon="!" onPress={() => router.push('/alerts')} />
        <Tile label="Profile" icon="●" onPress={() => router.push('/profile')} />
      </View>
      <Button label="Send feedback" variant="secondary" onPress={() => router.push('/feedback')} />
      <Text style={s.meta}>{state.user.role.replace('_', ' ')} · {getServerUrl()}</Text>
    </Screen>
  );
}

function Tile({ label, icon, tone, onPress }: { label: string; icon: string; tone?: 'danger'; onPress: () => void }) {
  const s = useStyles();
  const c = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [s.tile, tone && { borderColor: c.danger }, pressed && { opacity: 0.75 }]}>
      <Text style={[s.tileIcon, { color: tone ? c.danger : c.info }]} accessible={false}>{icon}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(c => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  welcome: { fontFamily: fonts.bodySemi, fontSize: 18, color: c.ink, marginTop: -4 },
  clear: { borderRadius: 14, padding: 16, backgroundColor: c.safeTint, borderLeftWidth: 6, borderLeftColor: c.safe, gap: 2 },
  clearTitle: { fontFamily: fonts.display, fontSize: 26, letterSpacing: 0.8, textTransform: 'uppercase', color: c.safe },
  clearText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: c.ink },
  row: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexBasis: '47%', flexGrow: 1, minHeight: 88, borderRadius: 12, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface2, padding: 12, justifyContent: 'space-between' },
  tileIcon: { fontFamily: fonts.display, fontSize: 24 },
  tileLabel: { fontFamily: fonts.display, fontSize: 18, letterSpacing: 0.5, textTransform: 'uppercase', color: c.ink },
  meta: { fontFamily: fonts.body, fontSize: 13, color: c.muted, textAlign: 'center' },
}));
