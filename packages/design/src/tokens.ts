/**
 * "Signage" design tokens: colours follow ISO 7010 safety-sign meanings (red danger/fire, green safe/exit,
 * amber warning, blue information). Light is the phone app's default; dark is the Command Center and dark mode.
 */
export type Mode = 'light' | 'dark';
type Pair = Record<Mode, string>;

export const tokens = {
  color: {
    danger: { light: '#D7263D', dark: '#FF4D5E' },
    safe: { light: '#0E8A61', dark: '#2BD48F' },
    warning: { light: '#B07A00', dark: '#FFC23D' },
    info: { light: '#1F6FEB', dark: '#4C8DFF' },
    ink: { light: '#0B1220', dark: '#E6EAF2' },
    muted: { light: '#4A5568', dark: '#A3AEC2' },
    surface: { light: '#FFFFFF', dark: '#0B1220' },
    surface2: { light: '#F4F6FA', dark: '#131B2B' },
    surface3: { light: '#E9EDF4', dark: '#1B2538' },
    line: { light: '#D5DBE5', dark: '#2A3650' },
  } satisfies Record<string, Pair>,
  space: [0, 4, 8, 12, 16, 24, 32] as const,
  radius: { sm: 6, md: 12, pill: 999 },
  font: { display: "'Barlow Condensed', 'Arial Narrow', sans-serif", body: "'Inter', system-ui, sans-serif" },
} as const;

export type ColorName = keyof typeof tokens.color;
