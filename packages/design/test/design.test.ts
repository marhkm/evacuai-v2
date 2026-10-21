import { contrast, cssVariables, tokens } from '../src/index';

test('contrast follows WCAG 2.x', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
});

describe.each(['light', 'dark'] as const)('%s theme', mode => {
  const c = tokens.color;
  const surfaces = [c.surface[mode], c.surface2[mode], c.surface3[mode]];

  test('body text is readable on every surface (4.5:1)', () => {
    for (const s of surfaces) {
      expect(contrast(c.ink[mode], s)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.muted[mode], s)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('status colours stand out as large text and icons (3:1)', () => {
    for (const status of [c.danger, c.safe, c.warning, c.info]) {
      expect(contrast(status[mode], c.surface[mode])).toBeGreaterThanOrEqual(3);
    }
  });
});

test('cssVariables emits custom properties for the theme', () => {
  const css = cssVariables('dark');
  expect(css).toContain('--evac-danger: #FF4D5E;');
  expect(css).toContain('--evac-surface: #0B1220;');
  expect(cssVariables('light')).toContain('--evac-danger: #D7263D;');
});
