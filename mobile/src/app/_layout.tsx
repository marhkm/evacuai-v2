import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AlertsProvider } from '@/lib/alerts';
import { AuthProvider } from '@/lib/auth';
import { useMode, useTheme } from '@/theme';

export default function RootLayout() {
  // Bundled with the app (works offline). Screens render at once with system fonts and switch when these load.
  useFonts({ BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const c = useTheme();
  const mode = useMode();
  return (
    <AuthProvider>
      <AlertsProvider>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.surface } }} />
      </AlertsProvider>
    </AuthProvider>
  );
}
