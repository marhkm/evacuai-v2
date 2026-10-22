import { semantics } from '@expo/ui/jetpack-compose/modifiers';

/** A spoken name for an @expo/ui control (TalkBack). */
export const nativeLabel = (label: string) => [semantics({ contentDescription: label })];
