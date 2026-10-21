import { render } from '@testing-library/react';
import { vi } from 'vitest';

import snapshot from '../../../campus-data/uclm.snapshot.json';

const probe = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@evacuai/campus-3d/src/mount', () => ({
  webglAvailable: () => { probe.calls++; return false; },
  mount: () => { throw new Error('not in jsdom'); },
}));

import View3D from './View3D';

test('checks for WebGL once, not on every render (each check costs a WebGL context)', () => {
  const snap = snapshot as never;
  const { rerender } = render(<View3D snap={snap} live={{ roomCounts: {} }} />);
  for (let i = 0; i < 5; i++) rerender(<View3D snap={snap} live={{ roomCounts: { x: i } }} />);
  expect(probe.calls).toBeLessThanOrEqual(1);
});
