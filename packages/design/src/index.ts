import { tokens, type ColorName, type Mode } from './tokens';

export { tokens, type ColorName, type Mode } from './tokens';

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};

/** WCAG 2.x contrast ratio between two #RRGGBB colours (1–21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The palette as CSS custom properties (`--evac-danger: #FF4D5E;` …) for one theme. */
export function cssVariables(mode: Mode): string {
  return (Object.keys(tokens.color) as ColorName[])
    .map(name => `--evac-${name}: ${tokens.color[name][mode]};`)
    .join('\n');
}
