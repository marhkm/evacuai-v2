import { tokens, type Mode } from '@evacuai/design';
import { StyleSheet, useColorScheme } from 'react-native';

/**
 * "Signage" theme: ISO 7010 meanings (red danger/SOS, green exit/safe, amber warning, blue information), light and
 * high-contrast by default for sunlight, dark when the phone is in dark mode. Colours come from @evacuai/design.
 */
const palette = (mode: Mode) => {
  const t = Object.fromEntries(Object.entries(tokens.color).map(([k, v]) => [k, v[mode]])) as Record<keyof typeof tokens.color, string>;
  return {
    ...t,
    onColor: '#FFFFFF', // text on danger / safe / info fills
    primary: t.safe, // the main way out: green like an exit sign
    // Filled buttons need white text at 4.5:1, so they use the deeper light-theme shades in both modes.
    dangerFill: tokens.color.danger.light,
    safeFill: '#0B7A55', // the light-theme safe green is 4.35:1 under white text; one shade deeper for fills
    infoFill: tokens.color.info.light,
    warningFill: tokens.color.warning.light,
    drillFill: '#8A5A00',
    // Soft backgrounds for status cards (sent SOS, checked in, …), readable under ink text in each mode.
    safeTint: mode === 'light' ? '#E3F4EC' : '#10291F',
    dangerTint: mode === 'light' ? '#FDECEA' : '#3A1418',
    warningTint: mode === 'light' ? '#FFF4E0' : '#33270B',
    infoTint: mode === 'light' ? '#E8F0FE' : '#14223D',
    border: t.line,
    card: t.surface2,
    text: t.ink,
  };
};

export type Palette = ReturnType<typeof palette>;
export const palettes: Record<Mode, Palette> = { light: palette('light'), dark: palette('dark') };

/** Font families loaded in the root layout (bundled, so they work offline); system fonts until they load. */
export const fonts = {
  display: 'BarlowCondensed_700Bold',
  displaySemi: 'BarlowCondensed_600SemiBold',
  body: 'Inter_400Regular',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
};

export const useMode = (): Mode => (useColorScheme() === 'dark' ? 'dark' : 'light');
export const useTheme = (): Palette => palettes[useMode()];

/** Styles built once per theme: `const useStyles = makeStyles(c => ({...}))`, then `const s = useStyles()` in the component. */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(build: (c: Palette) => T) {
  const cache: Partial<Record<Mode, T>> = {};
  return (): T => {
    const mode = useMode();
    return (cache[mode] ??= StyleSheet.create(build(palettes[mode])));
  };
}
