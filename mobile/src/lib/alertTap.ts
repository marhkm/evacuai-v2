import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

type Response = Notifications.NotificationResponse | null | undefined;
export type Tap = { alertId: number } | { sosId: number };

const tapOf = (r: Response): Tap | null => {
  const data = r?.notification?.request?.content?.data;
  if (data?.sos_id != null) return { sosId: Number(data.sos_id) };
  if (data?.alert_id != null) return { alertId: Number(data.alert_id) };
  return null;
};

/**
 * Tapping an alert push (alert_id) or an officer's SOS push (sos_id) hands its id to `open`, also when the tap is what
 * launched the app. The caller decides where to go (students: the route; officers: Alerts or the SOS). Returns an
 * unsubscribe function.
 */
export function onNotificationTap(open: (tap: Tap) => void): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const handle = (r: Response) => { const tap = tapOf(r); if (tap) open(tap); };
  Promise.resolve(Notifications.getLastNotificationResponseAsync?.()).then(handle).catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener?.(handle);
  return () => sub?.remove();
}
