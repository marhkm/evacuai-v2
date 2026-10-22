import { View } from 'react-native';
import Reanimated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';

// Motion settings in one place (expo-animation guidance). The fallbacks only matter in Jest, where expo-router's
// Reanimated stand-in has neither export; every device build has both.

/** True when the phone asks for reduced motion: drop scale and movement, keep gentle opacity changes. */
export const useReduced: () => boolean = typeof useReducedMotion === 'function' ? useReducedMotion : () => false;

/** Strong ease-out for press feedback and small state changes. */
export const EASE_OUT = (typeof cubicBezier === 'function' ? cubicBezier(0.23, 1, 0.32, 1) : 'ease-out') as ReturnType<typeof cubicBezier>;

/** Reanimated's View (CSS transitions on the UI thread); a plain View where the stand-in has none. */
export const AnimatedView: typeof Reanimated.View = (Reanimated as typeof Reanimated | undefined)?.View ?? (View as unknown as typeof Reanimated.View);
