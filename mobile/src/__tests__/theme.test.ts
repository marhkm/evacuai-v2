import { contrast } from '@evacuai/design';
import { renderHook } from '@testing-library/react-native';
import * as RN from 'react-native';

import { makeStyles, palettes } from '@/theme';

test.each(['light', 'dark'] as const)('%s theme: text is readable (WCAG AA)', mode => {
  const c = palettes[mode];
  for (const bg of [c.surface, c.surface2]) {
    expect(contrast(c.ink, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.muted, bg)).toBeGreaterThanOrEqual(4.5);
  }
  for (const fill of [c.dangerFill, c.safeFill, c.infoFill, c.drillFill]) expect(contrast(c.onColor, fill)).toBeGreaterThanOrEqual(4.5);
  for (const status of [c.danger, c.safe, c.warning, c.info]) expect(contrast(status, c.surface)).toBeGreaterThanOrEqual(3); // large status text
});

test('styles follow the phone: dark mode gets the dark surface', async () => {
  const useStyles = makeStyles(c => ({ page: { backgroundColor: c.surface } }));
  const scheme = jest.spyOn(RN, 'useColorScheme');
  scheme.mockReturnValue('dark');
  expect((await renderHook(useStyles)).result.current.page.backgroundColor).toBe(palettes.dark.surface);
  scheme.mockReturnValue('light');
  expect((await renderHook(useStyles)).result.current.page.backgroundColor).toBe(palettes.light.surface);
  scheme.mockRestore();
});
