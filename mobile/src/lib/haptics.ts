import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// One haptic per user action, fired with its visual (never the only feedback: many phones have haptics off).
const safe = (fn: () => Promise<void>) => () => { if (Platform.OS !== 'web') fn().catch(() => undefined); };

/** A choice changed (chip, floor, view). */
export const tap = safe(() => Haptics.selectionAsync());
/** A light press that starts something (Evacuate now). */
export const light = safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
/** A heavy action (Send SOS). */
export const medium = safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
/** It went through (SOS sent, checked in safe). */
export const success = safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
