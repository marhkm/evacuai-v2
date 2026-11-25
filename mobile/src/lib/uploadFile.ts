import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * A picked or captured file, ready for FormData. On phones Expo's fetch only sends real files: React Native's
 * `{ uri, name, type }` objects make it throw before anything is sent (which looked like "Cannot reach the server").
 * The browser build fetches the file into a Blob instead.
 */
export async function uploadFile(uri: string, webFile?: Blob | null): Promise<Blob> {
  if (Platform.OS === 'web') return webFile ?? (await (await fetch(uri)).blob());
  return new File(uri) as unknown as Blob; // has name, type and bytes(): what expo/fetch reads
}
