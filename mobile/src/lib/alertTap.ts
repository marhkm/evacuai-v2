import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

type Response = Notifications.NotificationResponse | null | undefined;
const isAlert = (r: Response) => r?.notification?.request?.content?.data?.alert_id != null;

/**
 * Tapping an alert push opens the evacuation route straight away (the route screen works out the start from the class
 * schedule or the saved location), also when the tap is what launched the app. Returns an unsubscribe function.
 */
export function openRouteOnAlertTap(open: () => void): () => void {
  if (Platform.OS === 'web') return () => undefined;
  Promise.resolve(Notifications.getLastNotificationResponseAsync?.())
    .then(r => { if (isAlert(r)) open(); })
    .catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener?.(r => { if (isAlert(r)) open(); });
  return () => sub?.remove();
}
