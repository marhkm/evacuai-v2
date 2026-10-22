import { render } from '@testing-library/react';
import { vi } from 'vitest';

import snapshot from '../../../campus-data/uclm.snapshot.json';

const viewers: { update: ReturnType<typeof vi.fn> }[] = [];
vi.mock('@evacuai/campus-3d/src/mount', () => ({
  webglAvailable: () => true,
  mount: () => {
    const v = { update: vi.fn(), setBuilding: vi.fn(), onChange: () => () => {}, dispose: vi.fn() };
    viewers.push(v);
    return v;
  },
}));

import View3D from './View3D';

test('re-applies the live picture to a viewer rebuilt for new campus data', () => {
  const live = { pins: [{ id: 'sos-1', nodeId: 'A1/4/C1', kind: 'sos' as const }] };
  const snap = snapshot as never;
  const { rerender } = render(<View3D snap={snap} live={live} />);
  rerender(<View3D snap={JSON.parse(JSON.stringify(snapshot))} live={live} />); // snapshot refetched, live unchanged
  expect(viewers).toHaveLength(2);
  expect(viewers[1].update).toHaveBeenCalledWith(live);
});
