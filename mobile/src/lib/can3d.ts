import * as Device from 'expo-device';
import { Platform } from 'react-native';

export const MIN_3D_MEMORY = 3 * 1024 ** 3; // spec: hide 3D on phones with less than 3 GB RAM

/** Whether to offer the 3D view: WebGL on the web build, enough RAM on phones. */
export function can3d(): boolean {
  if (Platform.OS === 'web') {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch {
      return false;
    }
  }
  return (Device.totalMemory ?? 0) >= MIN_3D_MEMORY;
}
