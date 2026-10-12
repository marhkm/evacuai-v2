import { Stack } from 'expo-router';

import { AlertsProvider } from '@/lib/alerts';
import { AuthProvider } from '@/lib/auth';

export default function RootLayout() {
  return (
    <AuthProvider>
      <AlertsProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AlertsProvider>
    </AuthProvider>
  );
}
