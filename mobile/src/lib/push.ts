import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/lib/api';

/**
 * Registers this phone for alert pushes. Needs a real device, notification permission and an EAS project id
 * (set when the APK build is configured); silently skips otherwise. Alerts still arrive live while the app is open.
 */
export async function registerForPush(token: string): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;

  if (Platform.OS === 'android') {
    // Matches channelId "emergency" in the server's Expo push payload.
    await Notifications.setNotificationChannelAsync('emergency', {
      name: 'Emergency alerts',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 500, 250, 500],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const granted = existing.granted || (await Notifications.requestPermissionsAsync()).granted;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!granted || !projectId) return;

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api('/api/devices', { method: 'POST', token, body: { token: data, platform: Platform.OS } });
}
