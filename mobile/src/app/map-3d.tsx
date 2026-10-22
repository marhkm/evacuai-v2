import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Campus3DPanel } from '@/components/Campus3DPanel';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/useCampus';
import { makeStyles } from '@/theme';

/** The 3D building full screen (a native full-screen modal), with the same native controls under it. */
export default function Map3DScreen() {
  const s = useStyles();
  const { state } = useAuth();
  const { snapshot } = useCampus();
  const { building } = useLocalSearchParams<{ building?: string }>();
  const { height } = useWindowDimensions();
  if (state.status === 'signedOut') return <Redirect href="/login" />;
  const id = snapshot?.buildings.find(b => b.id === building)?.id ?? snapshot?.buildings[0]?.id;

  return (
    <SafeAreaView style={s.page}>
      <Stack.Screen options={{ presentation: 'fullScreenModal' }} />
      <ScrollView contentContainerStyle={s.content}>
        {snapshot && id ? <Campus3DPanel snapshot={snapshot} building={id} height={Math.round(height * 0.62)} /> : null}
        <Button label="Close" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(c => ({
  page: { flex: 1, backgroundColor: c.surface },
  content: { padding: 12, gap: 12 },
}));
