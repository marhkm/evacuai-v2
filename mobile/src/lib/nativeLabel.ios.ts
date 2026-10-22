import { accessibilityLabel } from '@expo/ui/swift-ui/modifiers';

/** A spoken name for an @expo/ui control (VoiceOver). */
export const nativeLabel = (label: string) => [accessibilityLabel(label)];
