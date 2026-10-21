import { Alert, Platform } from 'react-native';

/** Cancel/OK question before an officer action. react-native-web's Alert ignores buttons, so the web build uses window.confirm. */
export function confirm(title: string, message: string, ok = 'OK'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
